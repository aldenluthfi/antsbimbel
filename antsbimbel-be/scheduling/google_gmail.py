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

    def send_new_user_credentials_email(self, *, to_email: str, username: str, password: str):
        try:
            message = EmailMessage()
            message['To'] = to_email
            message['Subject'] = 'Your ANTSBimbel Account Credentials'

            if self.sender_email:
                if self.sender_name:
                    message['From'] = f'{self.sender_name} <{self.sender_email}>'
                else:
                    message['From'] = self.sender_email

            message.set_content(
                (
                    'Your account has been created successfully.\n\n'
                    f'Username: {username}\n'
                    f'Password: {password}\n\n'
                )
            )

            encoded_message = base64.urlsafe_b64encode(message.as_bytes()).decode('utf-8')
            self.service.users().messages().send(
                userId='me',
                body={'raw': encoded_message},
            ).execute()
        except Exception as exc:
            raise GoogleGmailSendError(f'Unable to send email: {exc}') from exc
