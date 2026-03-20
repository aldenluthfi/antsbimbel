import io
import os
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

        scopes = ['https://www.googleapis.com/auth/drive']

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
        except Exception as exc:
            raise GoogleDriveUploadError(f'Unable to initialize Google Drive client: {exc}') from exc

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
            if self._is_spreadsheet_upload(target_mime_type=target_mime_type, source_mime_type=mime_type):
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
