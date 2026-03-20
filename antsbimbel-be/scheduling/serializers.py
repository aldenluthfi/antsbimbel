from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field
from .models import CheckIn, CheckOut, Schedule
from .permissions import is_admin, is_tutor

User = get_user_model()

class UserSerializer(serializers.ModelSerializer):
    role = serializers.ChoiceField(choices=['admin', 'tutor'])
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
            'role',
            'password',
        ]

    def validate_role(self, value):
        if value not in {'admin', 'tutor'}:
            raise serializers.ValidationError('Role must be either admin or tutor.')
        return value

    def validate_password(self, value):
        validate_password(value)
        return value

    def _apply_role(self, instance, role):
        if role == 'admin':
            instance.is_staff = True
        else:
            instance.is_staff = False
            instance.is_superuser = False

    def create(self, validated_data):
        role = validated_data.pop('role', 'tutor')
        password = validated_data.pop('password', None)

        user = User(**validated_data)
        self._apply_role(user, role)

        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()

        user.save()
        return user

    def update(self, instance, validated_data):
        role = validated_data.pop('role', None)
        password = validated_data.pop('password', None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if role is not None:
            self._apply_role(instance, role)

        if password:
            validate_password(password, user=instance)
            instance.set_password(password)

        instance.save()
        return instance

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['role'] = 'admin' if instance.is_staff else 'tutor'
        return data


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)


class LoginResponseSerializer(serializers.Serializer):
    token = serializers.CharField()
    user = UserSerializer()


class MessageSerializer(serializers.Serializer):
    detail = serializers.CharField()


class CheckInSerializer(serializers.ModelSerializer):
    check_in_id = serializers.IntegerField(source='id', read_only=True)
    tutor_id = serializers.PrimaryKeyRelatedField(source='tutor', queryset=User.objects.all(), required=False)
    check_out_id = serializers.SerializerMethodField()
    check_out_photo = serializers.ImageField(write_only=True, required=False)
    check_out_time = serializers.DateTimeField(write_only=True, required=False)
    total_shift_time = serializers.SerializerMethodField()

    class Meta:
        model = CheckIn
        fields = [
            'check_in_id',
            'tutor_id',
            'student_id',
            'check_in_time',
            'check_in_location',
            'check_in_photo',
            'check_out_id',
            'check_out_photo',
            'check_out_time',
            'total_shift_time',
        ]
        read_only_fields = ['check_in_id', 'check_out_id', 'total_shift_time']

    def validate_tutor_id(self, tutor):
        if is_admin(tutor):
            raise serializers.ValidationError('Tutor must be a non-admin user.')
        return tutor

    @extend_schema_field(serializers.IntegerField(allow_null=True))
    def get_check_out_id(self, obj):
        check_out = getattr(obj, 'check_out', None)
        return check_out.id if check_out else None

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_total_shift_time(self, obj):
        check_out = getattr(obj, 'check_out', None)
        if not check_out or check_out.total_shift_time is None:
            return None
        return str(check_out.total_shift_time)

    def _upsert_checkout(self, check_in, check_out_photo=None, check_out_time=None):
        if not check_out_photo and not check_out_time:
            return

        defaults = {}
        if check_out_photo is not None:
            defaults['check_out_photo'] = check_out_photo
        if check_out_time is not None:
            defaults['check_out_time'] = check_out_time

        check_out, created = CheckOut.objects.get_or_create(check_in=check_in, defaults=defaults)

        if not created:
            for key, value in defaults.items():
                setattr(check_out, key, value)
            check_out.save()

    def create(self, validated_data):
        request = self.context.get('request')
        check_out_photo = validated_data.pop('check_out_photo', None)
        check_out_time = validated_data.pop('check_out_time', None)

        if is_tutor(request.user):
            validated_data['tutor'] = request.user

        check_in = CheckIn.objects.create(**validated_data)
        self._upsert_checkout(check_in, check_out_photo, check_out_time)
        return check_in

    def update(self, instance, validated_data):
        request = self.context.get('request')
        check_out_photo = validated_data.pop('check_out_photo', None)
        check_out_time = validated_data.pop('check_out_time', None)

        if is_tutor(request.user):
            validated_data['tutor'] = request.user

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        self._upsert_checkout(instance, check_out_photo, check_out_time)
        return instance


class ScheduleSerializer(serializers.ModelSerializer):
    tutor_id = serializers.PrimaryKeyRelatedField(source='tutor', queryset=User.objects.all())

    class Meta:
        model = Schedule
        fields = [
            'id',
            'tutor_id',
            'student_id',
            'subject_topic',
            'scheduled_at',
            'status',
        ]

    def validate_tutor_id(self, tutor):
        if is_admin(tutor):
            raise serializers.ValidationError('Tutor must be a non-admin user.')
        return tutor
