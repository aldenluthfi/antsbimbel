from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from .drive_paths import email_log_file_name, email_log_folder_parts
from .google_drive import GoogleDriveUploadError, GoogleDriveUploader


class EmailDriveLogger:
    """Writes email send audit logs to Google Drive. Logging failures are non-fatal."""

    def log_send_result(
        self,
        *,
        to_email: str,
        subject: str,
        status: str,
        purpose: str,
        cause: str = '',
        extra_lines: list[str] | None = None,
    ) -> None:
        log_time = timezone.now()
        extra_lines = extra_lines or []
        payload_lines = [
            f'timestamp={timezone.localtime(log_time).isoformat()}',
            f'to={to_email}',
            f'subject={subject}',
            f'status={status}',
            f'purpose={purpose}',
            f'cause={cause or "-"}',
        ]
        payload_lines.extend(extra_lines)
        payload_lines.append('')

        file_obj = SimpleUploadedFile(
            name=email_log_file_name(log_time),
            content='\n'.join(payload_lines).encode('utf-8'),
            content_type='text/plain',
        )

        try:
            uploader = GoogleDriveUploader()
            uploader.upload_file(
                file_obj=file_obj,
                folder_parts=email_log_folder_parts(log_time),
                file_name=file_obj.name,
            )
        except GoogleDriveUploadError:
            # Never fail email flow when audit upload is unavailable.
            return
