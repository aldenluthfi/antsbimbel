from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field
from .models import CheckIn, CheckOut, Schedule, Student
from .permissions import is_admin, is_tutor

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

        user = User(**validated_data)
        self._apply_tutor_role(user)

        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()

        user.save()
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


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)


class LoginResponseSerializer(serializers.Serializer):
    token = serializers.CharField()
    user = UserSerializer()


class MessageSerializer(serializers.Serializer):
    detail = serializers.CharField()


class StudentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Student
        fields = [
            'id',
            'student_id',
            'full_name',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'student_id', 'created_at', 'updated_at']


class CheckInSerializer(serializers.ModelSerializer):
    check_in_id = serializers.IntegerField(source='id', read_only=True)
    tutor_id = serializers.PrimaryKeyRelatedField(source='tutor', queryset=User.objects.all(), required=False)
    schedule_id = serializers.PrimaryKeyRelatedField(source='schedule', queryset=Schedule.objects.all(), write_only=True, required=False)
    check_out_id = serializers.SerializerMethodField()
    check_out_photo = serializers.ImageField(write_only=True, required=False)
    check_out_time = serializers.DateTimeField(write_only=True, required=False)
    total_shift_time = serializers.SerializerMethodField()

    class Meta:
        model = CheckIn
        fields = [
            'check_in_id',
            'tutor_id',
            'schedule_id',
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

    def validate_schedule_id(self, schedule):
        request = self.context.get('request')

        if schedule.check_in_id:
            raise serializers.ValidationError('This schedule is already linked to a check-in.')

        if request and is_tutor(request.user) and schedule.tutor_id != request.user.id:
            raise serializers.ValidationError('Tutors can only link check-ins to their own schedules.')

        return schedule

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

    @transaction.atomic
    def create(self, validated_data):
        request = self.context.get('request')
        schedule = validated_data.pop('schedule', None)
        check_out_photo = validated_data.pop('check_out_photo', None)
        check_out_time = validated_data.pop('check_out_time', None)

        if is_tutor(request.user):
            validated_data['tutor'] = request.user

        check_in = CheckIn.objects.create(**validated_data)

        if schedule:
            schedule.check_in = check_in
            schedule.save(update_fields=['check_in'])

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
    check_in_id = serializers.SerializerMethodField()
    check_out_id = serializers.SerializerMethodField()

    class Meta:
        model = Schedule
        fields = [
            'id',
            'tutor_id',
            'student_id',
            'subject_topic',
            'scheduled_at',
            'status',
            'check_in_id',
            'check_out_id',
        ]

    def validate_tutor_id(self, tutor):
        if is_admin(tutor):
            raise serializers.ValidationError('Tutor must be a non-admin user.')
        return tutor

    @extend_schema_field(serializers.IntegerField(allow_null=True))
    def get_check_in_id(self, obj):
        check_in = getattr(obj, 'check_in', None)
        return check_in.id if check_in else None

    @extend_schema_field(serializers.IntegerField(allow_null=True))
    def get_check_out_id(self, obj):
        check_in = getattr(obj, 'check_in', None)
        check_out = getattr(check_in, 'check_out', None) if check_in else None
        return check_out.id if check_out else None
