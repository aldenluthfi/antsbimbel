from datetime import timedelta
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from django.utils import timezone
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

    def validate(self, attrs):
        request = self.context.get('request')
        if not request or not is_tutor(request.user):
            return attrs

        schedule = attrs.get('schedule')
        is_create = self.instance is None

        if is_create and not schedule:
            raise serializers.ValidationError({'schedule_id': 'Tutor check-in must be linked to a schedule.'})

        if is_create and schedule:
            check_in_time = attrs.get('check_in_time') or timezone.now()
            if timezone.is_naive(check_in_time):
                check_in_time = timezone.make_aware(check_in_time, timezone.get_current_timezone())

            scheduled_at = schedule.scheduled_at
            if timezone.is_naive(scheduled_at):
                scheduled_at = timezone.make_aware(scheduled_at, timezone.get_current_timezone())

            earliest_check_in = scheduled_at - timedelta(minutes=30)
            if check_in_time < earliest_check_in:
                raise serializers.ValidationError(
                    {'check_in_time': 'Tutors can only check in at most 30 minutes before the schedule time.'}
                )

        return attrs

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

        self._mark_schedule_done(check_in)

    def _mark_schedule_done(self, check_in):
        try:
            schedule = check_in.schedule
        except Schedule.DoesNotExist:
            return

        if schedule.status != Schedule.STATUS_DONE:
            schedule.status = Schedule.STATUS_DONE
            schedule.save(update_fields=['status'])

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
    tutor_name = serializers.SerializerMethodField()
    student_name = serializers.SerializerMethodField()
    check_in_id = serializers.SerializerMethodField()
    check_out_id = serializers.SerializerMethodField()
    check_in_detail = serializers.SerializerMethodField()
    check_out_detail = serializers.SerializerMethodField()

    class Meta:
        model = Schedule
        fields = [
            'id',
            'tutor_id',
            'tutor_name',
            'student_id',
            'student_name',
            'subject_topic',
            'scheduled_at',
            'status',
            'check_in_id',
            'check_out_id',
            'check_in_detail',
            'check_out_detail',
        ]

    def validate_tutor_id(self, tutor):
        if is_admin(tutor):
            raise serializers.ValidationError('Tutor must be a non-admin user.')
        return tutor

    @extend_schema_field(serializers.CharField())
    def get_tutor_name(self, obj):
        first_name = (obj.tutor.first_name or '').strip()
        last_name = (obj.tutor.last_name or '').strip()
        full_name = f'{first_name} {last_name}'.strip()
        return full_name or obj.tutor.username

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_student_name(self, obj):
        cache = self.context.setdefault('_student_name_cache', {})
        student_id = obj.student_id

        if student_id not in cache:
            cache[student_id] = Student.objects.filter(student_id=student_id).values_list('full_name', flat=True).first()

        return cache[student_id]

    @extend_schema_field(serializers.IntegerField(allow_null=True))
    def get_check_in_id(self, obj):
        check_in = getattr(obj, 'check_in', None)
        return check_in.id if check_in else None

    @extend_schema_field(serializers.IntegerField(allow_null=True))
    def get_check_out_id(self, obj):
        check_in = getattr(obj, 'check_in', None)
        check_out = getattr(check_in, 'check_out', None) if check_in else None
        return check_out.id if check_out else None

    def _build_media_url(self, file_field):
        if not file_field:
            return None

        url = getattr(file_field, 'url', None)
        if not url:
            return None

        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(url)
        return url

    @extend_schema_field(
        {
            'type': 'object',
            'nullable': True,
            'properties': {
                'id': {'type': 'integer'},
                'time': {'type': 'string', 'format': 'date-time'},
                'location': {'type': 'string'},
                'photo': {'type': 'string', 'nullable': True},
            },
        }
    )
    def get_check_in_detail(self, obj):
        check_in = getattr(obj, 'check_in', None)
        if not check_in:
            return None

        return {
            'id': check_in.id,
            'time': check_in.check_in_time,
            'location': check_in.check_in_location,
            'photo': self._build_media_url(check_in.check_in_photo),
        }

    @extend_schema_field(
        {
            'type': 'object',
            'nullable': True,
            'properties': {
                'id': {'type': 'integer'},
                'time': {'type': 'string', 'format': 'date-time'},
                'photo': {'type': 'string', 'nullable': True},
            },
        }
    )
    def get_check_out_detail(self, obj):
        check_in = getattr(obj, 'check_in', None)
        check_out = getattr(check_in, 'check_out', None) if check_in else None
        if not check_out:
            return None

        return {
            'id': check_out.id,
            'time': check_out.check_out_time,
            'photo': self._build_media_url(check_out.check_out_photo),
        }
