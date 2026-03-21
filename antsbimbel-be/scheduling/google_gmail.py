import base64
from email.message import EmailMessage

from django.conf import settings
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build


class GoogleGmailSendError(Exception):
    pass


class GoogleGmailSender:
    def __init__(self):
        self.oauth_client_id = settings.GOOGLE_OAUTH_CLIENT_ID
        self.oauth_client_secret = settings.GOOGLE_OAUTH_CLIENT_SECRET
        self.oauth_refresh_token = settings.GOOGLE_OAUTH_REFRESH_TOKEN
        self.oauth_token_uri = settings.GOOGLE_OAUTH_TOKEN_URI
        self.sender_email = settings.GOOGLE_GMAIL_SENDER_EMAIL
        self.sender_name = settings.GOOGLE_GMAIL_SENDER_NAME

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
            raise GoogleGmailSendError(
                f"Missing OAuth configuration: {', '.join(missing_oauth_values)}."
            )

        scopes = ['https://www.googleapis.com/auth/gmail.send']

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
            self.service = build('gmail', 'v1', credentials=credentials, cache_discovery=False)
        except Exception as exc:
            error_text = str(exc)
            if 'invalid_scope' in error_text:
                raise GoogleGmailSendError(
                    'Unable to initialize Gmail client: invalid_scope. '
                    'Regenerate GOOGLE_OAUTH_REFRESH_TOKEN with BOTH scopes: '
                    'https://www.googleapis.com/auth/drive and '
                    'https://www.googleapis.com/auth/gmail.send'
                ) from exc
            raise GoogleGmailSendError(f'Unable to initialize Gmail client: {exc}') from exc

    def send_new_user_credentials_email(
        self,
        *,
        to_email: str,
        username: str,
        password: str,
        first_name: str = '',
        last_name: str = '',
    ):
        try:
            message = EmailMessage()
            message['To'] = to_email
            message['Subject'] = 'Welcome to ANTS Bimbel - Your Tutor Account Is Ready'

            if self.sender_email:
                if self.sender_name:
                    message['From'] = f'{self.sender_name} <{self.sender_email}>'
                else:
                    message['From'] = self.sender_email

            full_name = ' '.join(part for part in [first_name.strip(), last_name.strip()] if part)
            greeting_name = full_name or username

            message.set_content(
                (
                    f'Hello {greeting_name},\n\n'
                    'Your ANTS Bimbel tutor account has been created successfully.\n\n'
                    'Login credentials:\n'
                    f'- Username: {username}\n'
                    f'- Password: {password}\n\n'
                    'Please keep these credentials secure.\n\n'
                    'Best regards,\n'
                    'ANTS Bimbel Team\n'
                )
            )

            message.add_alternative(
                (
                    '<!doctype html>'
                    '<html>'
                    '<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">'
                    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">'
                    '<tr>'
                    '<td align="center">'
                    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" '
                    'style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">'
                    '<tr>'
                    '<td style="background:#f59e0b;padding:18px 24px;color:#111827;font-size:20px;font-weight:700;">'
                    'ANTS Bimbel Tutor Account'
                    '</td>'
                    '</tr>'
                    '<tr>'
                    '<td style="padding:24px;font-size:14px;line-height:1.6;">'
                    f'<p style="margin:0 0 12px;">Hello {greeting_name},</p>'
                    '<p style="margin:0 0 16px;">Your tutor account has been created successfully.</p>'
                    '<p style="margin:0 0 8px;font-weight:600;">Login credentials</p>'
                    '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">'
                    '<tr><td style="padding:4px 0;width:110px;color:#475569;">Username</td>'
                    f'<td style="padding:4px 0;font-weight:600;">{username}</td></tr>'
                    '<tr><td style="padding:4px 0;width:110px;color:#475569;">Password</td>'
                    f'<td style="padding:4px 0;font-weight:600;">{password}</td></tr>'
                    '</table>'
                    '<p style="margin:0;color:#475569;">Please keep these credentials secure.</p>'
                    '</td>'
                    '</tr>'
                    '<tr>'
                    '<td style="padding:14px 24px;background:#f8fafc;color:#64748b;font-size:12px;">'
                    'This is an automated message from ANTS Bimbel.'
                    '</td>'
                    '</tr>'
                    '</table>'
                    '</td>'
                    '</tr>'
                    '</table>'
                    '</body>'
                    '</html>'
                ),
                subtype='html',
            )

            encoded_message = base64.urlsafe_b64encode(message.as_bytes()).decode('utf-8')
            self.service.users().messages().send(
                userId='me',
                body={'raw': encoded_message},
            ).execute()
        except Exception as exc:
            raise GoogleGmailSendError(f'Unable to send email: {exc}') from exc
