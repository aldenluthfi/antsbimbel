from django.contrib.auth import authenticate, get_user_model, logout
from django.db import transaction
from drf_spectacular.utils import OpenApiExample, extend_schema
from rest_framework.exceptions import ValidationError
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .auth_serializers import (
    LoginResponseSerializer,
    LoginSerializer,
    MessageSerializer,
    ResetPasswordResponseSerializer,
    ResetPasswordSerializer,
)
from .google_gmail import GoogleGmailSendError, GoogleGmailSender
from .user_serializers import UserSerializer


User = get_user_model()


class LoginView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        request=LoginSerializer,
        responses={200: LoginResponseSerializer, 400: MessageSerializer, 401: MessageSerializer, 403: MessageSerializer},
    )
    def post(self, request):
        username = request.data.get('username')
        password = request.data.get('password')

        if not username or not password:
            return Response(
                {'detail': 'username and password are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = authenticate(request=request, username=username, password=password)
        if not user:
            return Response({'detail': 'Invalid credentials.'}, status=status.HTTP_401_UNAUTHORIZED)

        if not user.is_active:
            return Response({'detail': 'User account is inactive.'}, status=status.HTTP_403_FORBIDDEN)

        Token.objects.filter(user=user).delete()
        token = Token.objects.create(user=user)

        return Response(
            {
                'token': token.key,
                'user': UserSerializer(user).data,
            },
            status=status.HTTP_200_OK,
        )


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={200: MessageSerializer})
    def post(self, request):
        Token.objects.filter(user=request.user).delete()
        logout(request)
        return Response({'detail': 'Successfully logged out.'}, status=status.HTTP_200_OK)


class ResetPasswordView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=ResetPasswordSerializer,
        responses={200: ResetPasswordResponseSerializer, 400: MessageSerializer, 403: MessageSerializer},
        examples=[
            OpenApiExample(
                name='Admin reset tutor password',
                value={'user_id': 7},
                request_only=True,
            ),
            OpenApiExample(
                name='Tutor reset own password',
                value={
                    'old_password': 'currentPassword123',
                    'new_password': 'NewStrongPass123!',
                    'confirm_new_password': 'NewStrongPass123!',
                },
                request_only=True,
            ),
            OpenApiExample(
                name='Reset password success response',
                value={'detail': 'Password updated successfully.'},
                response_only=True,
            ),
        ],
    )
    def post(self, request):
        serializer = ResetPasswordSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)

        target_user = serializer.validated_data['target_user']
        generated_password = serializer.validated_data['generated_password']

        if request.user.is_staff:
            with transaction.atomic():
                target_user.set_password(generated_password)
                target_user.save(update_fields=['password'])

                try:
                    gmail_sender = GoogleGmailSender()
                    gmail_sender.send_new_user_credentials_email(
                        to_email=target_user.email,
                        username=target_user.username,
                        first_name=target_user.first_name,
                        last_name=target_user.last_name,
                        password=generated_password,
                    )
                except GoogleGmailSendError as exc:
                    raise ValidationError(
                        {'detail': f'Failed to send reset credentials email. {exc}'}
                    ) from exc

            return Response(
                {'detail': 'Tutor password has been reset to default and credentials email sent.'},
                status=status.HTTP_200_OK,
            )

        new_password = serializer.validated_data['new_password']
        target_user.set_password(new_password)
        target_user.save(update_fields=['password'])

        return Response({'detail': 'Password updated successfully.'}, status=status.HTTP_200_OK)
