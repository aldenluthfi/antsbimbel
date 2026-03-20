import json
import os
import urllib.parse
import urllib.request

from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
	help = 'Generate Google OAuth consent URL and exchange authorization code for refresh token.'

	def add_arguments(self, parser):
		parser.add_argument('--client-id', dest='client_id', help='OAuth client ID.')
		parser.add_argument('--client-secret', dest='client_secret', help='OAuth client secret.')
		parser.add_argument('--redirect-uri', dest='redirect_uri', help='OAuth redirect URI.')
		parser.add_argument('--auth-code', dest='auth_code', help='Authorization code from consent screen.')
		parser.add_argument(
			'--scope',
			dest='scope',
			default='https://www.googleapis.com/auth/drive',
			help='OAuth scope. Defaults to full Google Drive scope.',
		)

	def handle(self, *args, **options):
		client_id = (options.get('client_id') or os.getenv('GOOGLE_OAUTH_CLIENT_ID') or '').strip()
		client_secret = (options.get('client_secret') or os.getenv('GOOGLE_OAUTH_CLIENT_SECRET') or '').strip()
		redirect_uri = (
			options.get('redirect_uri')
			or os.getenv('GOOGLE_OAUTH_REDIRECT_URI')
			or 'http://127.0.0.1:8080/callback'
		).strip()
		auth_code = (options.get('auth_code') or '').strip()
		scope = (options.get('scope') or '').strip()

		if not client_id:
			raise CommandError('Missing client ID. Provide --client-id or set GOOGLE_OAUTH_CLIENT_ID.')

		if not redirect_uri:
			raise CommandError('Missing redirect URI. Provide --redirect-uri or set GOOGLE_OAUTH_REDIRECT_URI.')

		if not scope:
			raise CommandError('Scope cannot be empty.')

		consent_params = {
			'client_id': client_id,
			'redirect_uri': redirect_uri,
			'response_type': 'code',
			'scope': scope,
			'access_type': 'offline',
			'prompt': 'consent',
			'include_granted_scopes': 'true',
		}
		consent_url = (
			'https://accounts.google.com/o/oauth2/v2/auth?'
			+ urllib.parse.urlencode(consent_params)
		)

		self.stdout.write(self.style.SUCCESS('Step 1: Open this URL in your browser and approve access:'))
		self.stdout.write(consent_url)

		if not auth_code:
			self.stdout.write(
				self.style.WARNING(
					'Step 2: Re-run this command with --auth-code="<code from redirect URL>" to get refresh token.'
				)
			)
			return

		if not client_secret:
			raise CommandError('Missing client secret. Provide --client-secret or set GOOGLE_OAUTH_CLIENT_SECRET.')

		token_payload = {
			'code': auth_code,
			'client_id': client_id,
			'client_secret': client_secret,
			'redirect_uri': redirect_uri,
			'grant_type': 'authorization_code',
		}
		encoded_payload = urllib.parse.urlencode(token_payload).encode('utf-8')
		token_request = urllib.request.Request(
			url='https://oauth2.googleapis.com/token',
			data=encoded_payload,
			headers={'Content-Type': 'application/x-www-form-urlencoded'},
			method='POST',
		)

		try:
			with urllib.request.urlopen(token_request, timeout=30) as response:
				token_response = json.loads(response.read().decode('utf-8'))
		except Exception as exc:
			raise CommandError(f'Failed to exchange authorization code: {exc}') from exc

		refresh_token = (token_response.get('refresh_token') or '').strip()
		access_token = (token_response.get('access_token') or '').strip()

		if not refresh_token:
			pretty = json.dumps(token_response, indent=2)
			raise CommandError(
				'No refresh_token returned. Ensure prompt=consent is used and this is the first consent for this client/scope. '
				f'Response: {pretty}'
			)

		self.stdout.write(self.style.SUCCESS('Refresh token generated successfully.'))
		self.stdout.write(f'refresh_token={refresh_token}')

		if access_token:
			self.stdout.write(f'access_token={access_token}')
