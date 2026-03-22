from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from rest_framework import serializers

from .google_gmail import GoogleGmailSendError, GoogleGmailSender


User = get_user_model()


def normalize_password_part(value):
    return ''.join(char for char in (value or '').strip().lower() if char.isalnum())


def generate_default_user_password(first_name, last_name):
    normalized_first_name = normalize_password_part(first_name)
    normalized_last_name = normalize_password_part(last_name)

    errors = {}
    if not normalized_first_name:
        errors['first_name'] = 'First name is required to generate account password.'
    if not normalized_last_name:
        errors['last_name'] = 'Last name is required to generate account password.'
    if errors:
        raise serializers.ValidationError(errors)

    return f'{normalized_first_name}.{normalized_last_name}'


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'first_name',
            'last_name',
            'email',
            'is_active',
            'password',
        ]

    def validate_password(self, value):
        if self.instance is not None:
            validate_password(value, user=self.instance)
        return value

    def _build_generated_password(self, validated_data):
        return generate_default_user_password(
            validated_data.get('first_name'),
            validated_data.get('last_name'),
        )

    def _apply_tutor_role(self, instance):
        instance.is_staff = False
        instance.is_superuser = False

    def create(self, validated_data):
        validated_data.pop('password', None)
        email = (validated_data.get('email') or '').strip()

        if not email:
            raise serializers.ValidationError({'email': 'Email is required to deliver account credentials.'})

        user = User(**validated_data)
        self._apply_tutor_role(user)

        password = self._build_generated_password(validated_data)
        user.set_password(password)

        with transaction.atomic():
            user.save()

            try:
                gmail_sender = GoogleGmailSender()
                gmail_sender.send_new_user_credentials_email(
                    to_email=email,
                    username=user.username,
                    first_name=user.first_name,
                    last_name=user.last_name,
                    password=password,
                )
            except GoogleGmailSendError as exc:
                raise serializers.ValidationError({'detail': f'Failed to send credentials email to the new user. {exc}'}) from exc

        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if password:
            validate_password(password, user=instance)
            instance.set_password(password)

        instance.save()
        return instance

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['role'] = 'admin' if instance.is_staff else 'tutor'
        return data
