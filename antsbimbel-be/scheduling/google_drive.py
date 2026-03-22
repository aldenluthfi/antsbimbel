import io
import os
import re
from typing import Iterable

from django.conf import settings
from django.utils import timezone
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload, MediaIoBaseUpload


class GoogleDriveUploadError(Exception):
    pass


class GoogleDriveUploader:
    GOOGLE_SPREADSHEET_MIME_TYPE = 'application/vnd.google-apps.spreadsheet'
    STATUS_CHIP_THEME = {
        'upcoming': {
            'background': {'red': 0.88, 'green': 0.95, 'blue': 1},
            'foreground': {'red': 0.03, 'green': 0.35, 'blue': 0.6},
        },
        'done': {
            'background': {'red': 0.87, 'green': 0.97, 'blue': 0.9},
            'foreground': {'red': 0.07, 'green': 0.45, 'blue': 0.23},
        },
        'missed': {
            'background': {'red': 1, 'green': 0.9, 'blue': 0.9},
            'foreground': {'red': 0.67, 'green': 0.14, 'blue': 0.14},
        },
        'cancelled': {
            'background': {'red': 0.94, 'green': 0.94, 'blue': 0.95},
            'foreground': {'red': 0.32, 'green': 0.32, 'blue': 0.36},
        },
        'rescheduled': {
            'background': {'red': 1, 'green': 0.95, 'blue': 0.84},
            'foreground': {'red': 0.57, 'green': 0.36, 'blue': 0.03},
        },
        'extended': {
            'background': {'red': 0.86, 'green': 0.95, 'blue': 0.89},
            'foreground': {'red': 0.05, 'green': 0.45, 'blue': 0.3},
        },
        'pending': {
            'background': {'red': 1, 'green': 0.93, 'blue': 0.84},
            'foreground': {'red': 0.6, 'green': 0.26, 'blue': 0.03},
        },
        'rejected': {
            'background': {'red': 1, 'green': 0.9, 'blue': 0.92},
            'foreground': {'red': 0.62, 'green': 0.07, 'blue': 0.2},
        },
    }
    SPREADSHEET_MIME_TYPES = {
        GOOGLE_SPREADSHEET_MIME_TYPE,
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/csv',
        'application/csv',
        'text/tab-separated-values',
    }

    def __init__(self):
        self.parent_folder_id = settings.GOOGLE_DRIVE_PARENT_FOLDER_ID
        self.shared_drive_id = settings.GOOGLE_DRIVE_SHARED_DRIVE_ID
        self.make_public = settings.GOOGLE_DRIVE_MAKE_PUBLIC
        self.auth_mode = settings.GOOGLE_DRIVE_AUTH_MODE
        self.oauth_client_id = settings.GOOGLE_OAUTH_CLIENT_ID
        self.oauth_client_secret = settings.GOOGLE_OAUTH_CLIENT_SECRET
        self.oauth_refresh_token = settings.GOOGLE_OAUTH_REFRESH_TOKEN
        self.oauth_token_uri = settings.GOOGLE_OAUTH_TOKEN_URI

        if self.auth_mode != 'oauth_user':
            raise GoogleDriveUploadError("GOOGLE_DRIVE_AUTH_MODE must be set to 'oauth_user'.")

        if not self.parent_folder_id:
            raise GoogleDriveUploadError('GOOGLE_DRIVE_PARENT_FOLDER_ID is not configured.')

        missing_oauth_values = [
            name
            for name, value in {
                'GOOGLE_OAUTH_CLIENT_ID': self.oauth_client_id,
                'GOOGLE_OAUTH_CLIENT_SECRET': self.oauth_client_secret,
                'GOOGLE_OAUTH_REFRESH_TOKEN': self.oauth_refresh_token,
                'GOOGLE_OAUTH_TOKEN_URI': self.oauth_token_uri,
            }.items()
            if not value
        ]
        if missing_oauth_values:
            raise GoogleDriveUploadError(
                f"Missing OAuth configuration: {', '.join(missing_oauth_values)}."
            )

        scopes = [
            'https://www.googleapis.com/auth/drive',
            'https://www.googleapis.com/auth/spreadsheets',
        ]

        try:
            credentials = Credentials(
                token=None,
                refresh_token=self.oauth_refresh_token,
                token_uri=self.oauth_token_uri,
                client_id=self.oauth_client_id,
                client_secret=self.oauth_client_secret,
                scopes=scopes,
            )
            credentials.refresh(Request())
            self.service = build('drive', 'v3', credentials=credentials, cache_discovery=False)
            self.sheets_service = build('sheets', 'v4', credentials=credentials, cache_discovery=False)
        except Exception as exc:
            raise GoogleDriveUploadError(f'Unable to initialize Google Drive client: {exc}') from exc

    def format_monthly_report_sheet(self, *, spreadsheet_id: str, sheet_title: str, status_values: list[str] | None = None):
        if not spreadsheet_id:
            raise GoogleDriveUploadError('Spreadsheet id is required.')
        if not str(sheet_title or '').strip():
            raise GoogleDriveUploadError('Sheet title is required.')

        try:
            spreadsheet = self.sheets_service.spreadsheets().get(
                spreadsheetId=spreadsheet_id,
                fields='sheets(properties(sheetId,title),bandedRanges(bandedRangeId),conditionalFormats)',
            ).execute()

            sheets = spreadsheet.get('sheets', [])
            if not sheets:
                raise GoogleDriveUploadError('Unable to find worksheet in generated spreadsheet.')

            sheet_properties = sheets[0].get('properties', {})
            sheet_id = sheet_properties.get('sheetId')
            current_sheet_title = sheet_properties.get('title')
            if sheet_id is None:
                raise GoogleDriveUploadError('Unable to resolve worksheet id for generated spreadsheet.')
            if not current_sheet_title:
                raise GoogleDriveUploadError('Unable to resolve worksheet title for generated spreadsheet.')

            values = self.sheets_service.spreadsheets().values().get(
                spreadsheetId=spreadsheet_id,
                range=f"'{current_sheet_title}'",
            ).execute().get('values', [])
            if not values:
                raise GoogleDriveUploadError('Unable to create table because the worksheet is empty.')

            row_count = len(values)
            column_count = max((len(row) for row in values), default=0)
            if column_count <= 0:
                raise GoogleDriveUploadError('Unable to create table because the worksheet has no columns.')

            status_column_index = None
            header_cells = [str(cell).strip().lower() for cell in (values[0] if values else [])]
            if header_cells:
                try:
                    status_column_index = header_cells.index('status')
                except ValueError:
                    status_column_index = None

            normalized_status_values = [
                str(status).strip()
                for status in (status_values or [])
                if str(status).strip()
            ]
            normalized_status_value_set = {status.lower() for status in normalized_status_values}

            status_conditional_format_requests = []
            if status_column_index is not None and row_count > 1:
                status_rule_index = 0
                for status_name, status_color in self.STATUS_CHIP_THEME.items():
                    if status_name not in normalized_status_value_set:
                        continue
                    status_conditional_format_requests.append(
                        {
                            'addConditionalFormatRule': {
                                'index': status_rule_index,
                                'rule': {
                                    'ranges': [
                                        {
                                            'sheetId': sheet_id,
                                            'startRowIndex': 1,
                                            'endRowIndex': row_count,
                                            'startColumnIndex': status_column_index,
                                            'endColumnIndex': status_column_index + 1,
                                        }
                                    ],
                                    'booleanRule': {
                                        'condition': {
                                            'type': 'TEXT_EQ',
                                            'values': [{'userEnteredValue': status_name}],
                                        },
                                        'format': {
                                            'backgroundColor': status_color['background'],
                                            'textFormat': {
                                                'bold': True,
                                                'foregroundColor': status_color['foreground'],
                                            },
                                        },
                                    },
                                },
                            }
                        }
                    )
                    status_rule_index += 1

            normalized_sheet_title = str(sheet_title).strip()

            requests = [
                {
                    'updateSheetProperties': {
                        'properties': {
                            'sheetId': sheet_id,
                            'title': normalized_sheet_title,
                            'gridProperties': {
                                'frozenRowCount': 1,
                            },
                        },
                        'fields': 'title,gridProperties.frozenRowCount',
                    }
                },
            ]

            for banded_range in sheets[0].get('bandedRanges', []):
                banded_range_id = banded_range.get('bandedRangeId')
                if banded_range_id is None:
                    continue
                requests.append(
                    {
                        'deleteBanding': {
                            'bandedRangeId': banded_range_id,
                        }
                    }
                )

            existing_conditional_format_count = len(sheets[0].get('conditionalFormats', []))
            for rule_index in range(existing_conditional_format_count - 1, -1, -1):
                requests.append(
                    {
                        'deleteConditionalFormatRule': {
                            'sheetId': sheet_id,
                            'index': rule_index,
                        }
                    }
                )

            requests.extend([
                {
                    'setBasicFilter': {
                        'filter': {
                            'range': {
                                'sheetId': sheet_id,
                                'startRowIndex': 0,
                                'endRowIndex': row_count,
                                'startColumnIndex': 0,
                                'endColumnIndex': column_count,
                            }
                        }
                    }
                },
                {
                    'addBanding': {
                        'bandedRange': {
                            'range': {
                                'sheetId': sheet_id,
                                'startRowIndex': 0,
                                'endRowIndex': row_count,
                                'startColumnIndex': 0,
                                'endColumnIndex': column_count,
                            },
                            'rowProperties': {
                                'headerColor': {
                                    'red': 1,
                                    'green': 0.94,
                                    'blue': 0.55,
                                },
                                'firstBandColor': {
                                    'red': 1,
                                    'green': 0.99,
                                    'blue': 0.95,
                                },
                                'secondBandColor': {
                                    'red': 1,
                                    'green': 1,
                                    'blue': 1,
                                },
                            },
                        }
                    }
                },
                {
                    'repeatCell': {
                        'range': {
                            'sheetId': sheet_id,
                            'startRowIndex': 0,
                            'endRowIndex': 1,
                            'startColumnIndex': 0,
                            'endColumnIndex': column_count,
                        },
                        'cell': {
                            'userEnteredFormat': {
                                'backgroundColor': {
                                    'red': 1,
                                    'green': 0.94,
                                    'blue': 0.55,
                                },
                                'horizontalAlignment': 'CENTER',
                                'textFormat': {
                                    'bold': True,
                                    'foregroundColor': {
                                        'red': 0.04,
                                        'green': 0.2,
                                        'blue': 0.42,
                                    },
                                },
                            },
                        },
                        'fields': 'userEnteredFormat(backgroundColor,horizontalAlignment,textFormat)',
                    }
                },
                {
                    'repeatCell': {
                        'range': {
                            'sheetId': sheet_id,
                            'startRowIndex': 1,
                            'endRowIndex': row_count,
                            'startColumnIndex': status_column_index,
                            'endColumnIndex': status_column_index + 1,
                        },
                        'cell': {
                            'userEnteredFormat': {
                                'horizontalAlignment': 'CENTER',
                                'verticalAlignment': 'MIDDLE',
                                'padding': {
                                    'top': 2,
                                    'right': 10,
                                    'bottom': 2,
                                    'left': 10,
                                },
                                'textFormat': {
                                    'bold': True,
                                },
                                'borders': {
                                    'top': {'style': 'SOLID', 'width': 1, 'color': {'red': 1, 'green': 1, 'blue': 1}},
                                    'bottom': {'style': 'SOLID', 'width': 1, 'color': {'red': 1, 'green': 1, 'blue': 1}},
                                    'left': {'style': 'SOLID', 'width': 1, 'color': {'red': 1, 'green': 1, 'blue': 1}},
                                    'right': {'style': 'SOLID', 'width': 1, 'color': {'red': 1, 'green': 1, 'blue': 1}},
                                },
                            },
                        },
                        'fields': 'userEnteredFormat(horizontalAlignment,verticalAlignment,padding,textFormat,borders)',
                    }
                } if (
                    status_column_index is not None
                    and row_count > 1
                ) else None,
                {
                    'setDataValidation': {
                        'range': {
                            'sheetId': sheet_id,
                            'startRowIndex': 1,
                            'endRowIndex': row_count,
                            'startColumnIndex': status_column_index,
                            'endColumnIndex': status_column_index + 1,
                        },
                        'rule': {
                            'condition': {
                                'type': 'ONE_OF_LIST',
                                'values': [
                                    {'userEnteredValue': value}
                                    for value in normalized_status_values
                                ],
                            },
                            'strict': True,
                            'showCustomUi': True,
                            'inputMessage': 'Select schedule status from the dropdown chip.',
                        },
                    }
                } if (
                    status_column_index is not None
                    and normalized_status_values
                    and row_count > 1
                ) else None,
                *status_conditional_format_requests,
                {
                    'autoResizeDimensions': {
                        'dimensions': {
                            'sheetId': sheet_id,
                            'dimension': 'COLUMNS',
                            'startIndex': 0,
                            'endIndex': column_count,
                        }
                    }
                },
            ])
            requests = [request for request in requests if request is not None]
            try:
                self.sheets_service.spreadsheets().batchUpdate(
                    spreadsheetId=spreadsheet_id,
                    body={'requests': requests},
                ).execute()
            except Exception:
                fallback_requests = [
                    request
                    for request in requests
                    if 'addBanding' not in request and 'addConditionalFormatRule' not in request
                ]
                self.sheets_service.spreadsheets().batchUpdate(
                    spreadsheetId=spreadsheet_id,
                    body={'requests': fallback_requests},
                ).execute()
        except GoogleDriveUploadError:
            raise
        except Exception as exc:
            raise GoogleDriveUploadError(f'Unable to format generated spreadsheet: {exc}') from exc

    def _list_flags(self):
        return {
            'supportsAllDrives': bool(self.shared_drive_id),
            'includeItemsFromAllDrives': bool(self.shared_drive_id),
        }

    def _write_flags(self):
        return {
            'supportsAllDrives': bool(self.shared_drive_id),
        }

    def _find_folder(self, name: str, parent_id: str):
        safe_name = name.replace("'", "\\'")
        query = (
            "mimeType='application/vnd.google-apps.folder' "
            "and trashed=false "
            f"and name='{safe_name}' "
            f"and '{parent_id}' in parents"
        )

        flags = self._list_flags()
        request = self.service.files().list(
            q=query,
            spaces='drive',
            fields='files(id, name)',
            corpora='drive' if self.shared_drive_id else 'user',
            driveId=self.shared_drive_id or None,
            pageSize=1,
            **flags,
        )
        response = request.execute()
        files = response.get('files', [])
        return files[0]['id'] if files else None

    @staticmethod
    def _append_datetime_suffix(file_name: str):
        base_name, extension = os.path.splitext(file_name)
        timestamp = timezone.localtime().strftime('%Y%m%d_%H%M%S_%f')
        if not base_name:
            return f'{file_name}_{timestamp}'
        return f'{base_name}_{timestamp}{extension}'

    @staticmethod
    def _has_datetime_suffix(file_name: str):
        base_name, _ = os.path.splitext(file_name)
        return bool(re.search(r'_\d{8}_\d{6}(?:_\d{6})?$', base_name))

    def _is_spreadsheet_upload(self, *, target_mime_type=None, source_mime_type=None):
        return target_mime_type in self.SPREADSHEET_MIME_TYPES or source_mime_type in self.SPREADSHEET_MIME_TYPES

    def _get_or_create_folder(self, name: str, parent_id: str):
        normalized_name = str(name or '').strip()
        if not normalized_name:
            raise GoogleDriveUploadError('Folder name cannot be empty.')

        folder_id = self._find_folder(name=normalized_name, parent_id=parent_id)
        if folder_id:
            return folder_id

        metadata = {
            'name': normalized_name,
            'mimeType': 'application/vnd.google-apps.folder',
            'parents': [parent_id],
        }

        flags = self._write_flags()
        request = self.service.files().create(
            body=metadata,
            fields='id',
            **flags,
        )
        folder = request.execute()
        return folder['id']

    def _ensure_path(self, folder_parts: Iterable[str]):
        parent_id = self.parent_folder_id
        for part in folder_parts:
            parent_id = self._get_or_create_folder(name=part, parent_id=parent_id)
        return parent_id

    def upload_file(
        self,
        *,
        file_obj,
        folder_parts: Iterable[str],
        file_name: str,
        target_mime_type=None,
        return_metadata=False,
    ):
        try:
            folder_id = self._ensure_path(folder_parts)

            if hasattr(file_obj, 'seek'):
                file_obj.seek(0)

            content = file_obj.read()
            mime_type = getattr(file_obj, 'content_type', None) or 'application/octet-stream'
            media = MediaIoBaseUpload(io.BytesIO(content), mimetype=mime_type, resumable=False)

            resolved_file_name = file_name
            if self._is_spreadsheet_upload(
                target_mime_type=target_mime_type,
                source_mime_type=mime_type,
            ) and not self._has_datetime_suffix(file_name):
                resolved_file_name = self._append_datetime_suffix(file_name)

            metadata = {
                'name': resolved_file_name,
                'parents': [folder_id],
            }
            if target_mime_type:
                metadata['mimeType'] = target_mime_type

            flags = self._write_flags()
            uploaded = self.service.files().create(
                body=metadata,
                media_body=media,
                fields='id, webViewLink, webContentLink',
                **flags,
            ).execute()

            if self.make_public:
                self.service.permissions().create(
                    fileId=uploaded['id'],
                    body={'type': 'anyone', 'role': 'reader'},
                    **flags,
                ).execute()
                uploaded = self.service.files().get(
                    fileId=uploaded['id'],
                    fields='id, webViewLink, webContentLink',
                    **flags,
                ).execute()

            if return_metadata:
                return {
                    'id': uploaded['id'],
                    'url': uploaded.get('webViewLink') or uploaded.get('webContentLink') or uploaded['id'],
                }

            return uploaded.get('webViewLink') or uploaded.get('webContentLink') or uploaded['id']
        except GoogleDriveUploadError:
            raise
        except Exception as exc:
            raise GoogleDriveUploadError(str(exc)) from exc

    def download_file(self, *, file_id: str):
        try:
            metadata = self.service.files().get(
                fileId=file_id,
                fields='id, name, mimeType',
                **self._write_flags(),
            ).execute()

            request = self.service.files().get_media(
                fileId=file_id,
                **self._write_flags(),
            )

            buffer = io.BytesIO()
            downloader = MediaIoBaseDownload(buffer, request)

            done = False
            while not done:
                _, done = downloader.next_chunk()

            return {
                'content': buffer.getvalue(),
                'name': metadata.get('name') or f'{file_id}.bin',
                'mime_type': metadata.get('mimeType') or 'application/octet-stream',
            }
        except Exception as exc:
            raise GoogleDriveUploadError(str(exc)) from exc

    def upload_csv_as_google_sheet(self, *, csv_content: str, file_name: str, parent_folder_id: str):
        try:
            media = MediaIoBaseUpload(
                io.BytesIO(csv_content.encode('utf-8')),
                mimetype='text/csv',
                resumable=False,
            )

            metadata = {
                'name': self._append_datetime_suffix(file_name),
                'mimeType': self.GOOGLE_SPREADSHEET_MIME_TYPE,
                'parents': [parent_folder_id],
            }

            flags = self._write_flags()
            uploaded = self.service.files().create(
                body=metadata,
                media_body=media,
                fields='id, webViewLink, webContentLink',
                **flags,
            ).execute()

            if self.make_public:
                self.service.permissions().create(
                    fileId=uploaded['id'],
                    body={'type': 'anyone', 'role': 'reader'},
                    **flags,
                ).execute()
                uploaded = self.service.files().get(
                    fileId=uploaded['id'],
                    fields='id, webViewLink, webContentLink',
                    **flags,
                ).execute()

            return {
                'id': uploaded['id'],
                'url': uploaded.get('webViewLink') or uploaded.get('webContentLink') or uploaded['id'],
            }
        except Exception as exc:
            raise GoogleDriveUploadError(str(exc)) from exc
