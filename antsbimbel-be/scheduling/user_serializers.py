from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from rest_framework import serializers

from .google_gmail import GoogleGmailSendError, GoogleGmailSender


User = get_user_model()


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
        validate_password(value)
        return value

    def _apply_tutor_role(self, instance):
        instance.is_staff = False
        instance.is_superuser = False

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        email = (validated_data.get('email') or '').strip()

        if not email:
            raise serializers.ValidationError({'email': 'Email is required to deliver account credentials.'})

        user = User(**validated_data)
        self._apply_tutor_role(user)

        generated_password = False
        if not password:
            password = User.objects.make_random_password(length=12)
            generated_password = True

        validate_password(password, user=user)
        user.set_password(password)

        with transaction.atomic():
            user.save()

            try:
                gmail_sender = GoogleGmailSender()
                gmail_sender.send_new_user_credentials_email(
                    to_email=email,
                    username=user.username,
                    password=password,
                )
            except GoogleGmailSendError as exc:
                message = 'Failed to send credentials email to the new user.'
                if generated_password:
                    message += ' A temporary password was generated but not delivered.'
                raise serializers.ValidationError({'detail': f'{message} {exc}'}) from exc

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
