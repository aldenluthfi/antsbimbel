from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .user_serializers import UserSerializer
from .user_serializers import generate_default_user_password


User = get_user_model()


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)


class LoginResponseSerializer(serializers.Serializer):
    token = serializers.CharField()
    user = UserSerializer()


class MessageSerializer(serializers.Serializer):
    detail = serializers.CharField()


class ResetPasswordSerializer(serializers.Serializer):
    user_id = serializers.IntegerField(required=False, min_value=1)
    old_password = serializers.CharField(required=False, write_only=True)
    new_password = serializers.CharField(required=False, write_only=True)
    confirm_new_password = serializers.CharField(required=False, write_only=True)

    def validate(self, attrs):
        request = self.context['request']
        requester = request.user

        if requester.is_staff:
            return self._validate_admin_reset(attrs)

        return self._validate_tutor_reset(attrs)

    def _validate_admin_reset(self, attrs):
        user_id = attrs.get('user_id')
        if not user_id:
            raise serializers.ValidationError({'user_id': 'Tutor user_id is required for admin password reset.'})

        target_user = User.objects.filter(pk=user_id).first()
        if not target_user:
            raise serializers.ValidationError({'user_id': 'Selected user does not exist.'})

        if target_user.is_staff or target_user.is_superuser:
            raise serializers.ValidationError({'detail': 'Admin password cannot be reset.'})

        if not (target_user.email or '').strip():
            raise serializers.ValidationError({'detail': 'Tutor email is required to deliver reset credentials.'})

        attrs['target_user'] = target_user
        attrs['generated_password'] = generate_default_user_password(
            target_user.first_name,
            target_user.last_name,
        )
        return attrs

    def _validate_tutor_reset(self, attrs):
        old_password = attrs.get('old_password')
        new_password = attrs.get('new_password')
        confirm_new_password = attrs.get('confirm_new_password')
        user_id = attrs.get('user_id')

        if user_id is not None:
            raise serializers.ValidationError({'user_id': 'Tutors can only reset their own password.'})

        if not old_password:
            raise serializers.ValidationError({'old_password': 'Old password is required.'})
        if not new_password:
            raise serializers.ValidationError({'new_password': 'New password is required.'})
        if not confirm_new_password:
            raise serializers.ValidationError({'confirm_new_password': 'Please repeat the new password.'})

        user = self.context['request'].user
        if not user.check_password(old_password):
            raise serializers.ValidationError({'old_password': 'Old password is incorrect.'})

        if new_password != confirm_new_password:
            raise serializers.ValidationError({'confirm_new_password': 'New passwords do not match.'})

        validate_password(new_password, user=user)
        attrs['target_user'] = user
        attrs['generated_password'] = None
        return attrs


class ResetPasswordResponseSerializer(serializers.Serializer):
    detail = serializers.CharField()
