from rest_framework import serializers

from .user_serializers import UserSerializer


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)


class LoginResponseSerializer(serializers.Serializer):
    token = serializers.CharField()
    user = UserSerializer()


class MessageSerializer(serializers.Serializer):
    detail = serializers.CharField()
