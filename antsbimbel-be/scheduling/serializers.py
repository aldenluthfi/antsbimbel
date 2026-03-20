from datetime import timedelta
from pathlib import Path
import re
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field
from .google_gmail import GoogleGmailSendError, GoogleGmailSender
from .google_drive import GoogleDriveUploadError, GoogleDriveUploader
from .location_utils import build_location_search_url
from .models import CheckIn, CheckOut, Schedule, Student
from .permissions import is_admin, is_tutor

User = get_user_model()


def _compose_name(first_name, last_name):
    return f'{(first_name or "").strip()} {(last_name or "").strip()}'.strip()

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
            'first_name',
            'last_name',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class CheckInSerializer(serializers.ModelSerializer):
    check_in_id = serializers.IntegerField(source='id', read_only=True)
    tutor = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), required=False)
    schedule_id = serializers.PrimaryKeyRelatedField(source='schedule', queryset=Schedule.objects.all(), write_only=True, required=False)
    check_in_photo = serializers.ImageField(write_only=True, required=False)
    check_in_photo_url = serializers.SerializerMethodField()
    check_out_id = serializers.SerializerMethodField()
    check_out_photo = serializers.ImageField(write_only=True, required=False)
    check_out_photo_url = serializers.SerializerMethodField()
    check_out_time = serializers.DateTimeField(write_only=True, required=False)
    total_shift_time = serializers.SerializerMethodField()

    class Meta:
        model = CheckIn
        fields = [
            'check_in_id',
            'tutor',
            'schedule_id',
            'student',
            'check_in_time',
            'check_in_location',
            'check_in_photo',
            'check_in_photo_url',
            'check_out_id',
            'check_out_photo',
            'check_out_photo_url',
            'check_out_time',
            'total_shift_time',
        ]
        read_only_fields = ['check_in_id', 'check_in_photo_url', 'check_out_id', 'check_out_photo_url', 'total_shift_time']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['check_in_location'] = build_location_search_url(instance.check_in_location)
        return data

    def validate_tutor(self, tutor):
        if is_admin(tutor):
            raise serializers.ValidationError('Tutor must be a non-admin user.')
        return tutor

    def validate_student(self, student):
        if not Student.objects.filter(id=student.id).exists():
            raise serializers.ValidationError('Student with this id does not exist.')
        return student

    def validate_schedule_id(self, schedule):
        request = self.context.get('request')

        if schedule.check_in_id:
            raise serializers.ValidationError('This schedule is already linked to a check-in.')

        if request and is_tutor(request.user) and schedule.tutor.id != request.user.id:
            raise serializers.ValidationError('Tutors can only link check-ins to their own schedules.')

        return schedule

    def validate(self, attrs):
        request = self.context.get('request')
        is_create = self.instance is None
        schedule = attrs.get('schedule')

        if self.instance is None and not attrs.get('check_in_photo'):
            raise serializers.ValidationError({'check_in_photo': 'Check-in photo is required.'})

        if is_create and not schedule:
            raise serializers.ValidationError({'schedule_id': 'Check-in must be linked to a schedule.'})

        if attrs.get('check_in_photo'):
            self._get_photo_extension(attrs['check_in_photo'])

        if attrs.get('check_out_photo'):
            self._get_photo_extension(attrs['check_out_photo'])

        if not request or not is_tutor(request.user):
            return attrs

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

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_check_in_photo_url(self, obj):
        return self._to_displayable_photo_url(
            value=getattr(obj, 'check_in_photo', None),
            check_in_id=obj.id,
            photo_kind='check-in',
        )

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_check_out_photo_url(self, obj):
        check_out = getattr(obj, 'check_out', None)
        if not check_out:
            return None
        return self._to_displayable_photo_url(
            value=check_out.check_out_photo,
            check_in_id=obj.id,
            photo_kind='check-out',
        )

    def _extract_google_drive_file_id(self, value):
        normalized = str(value or '').strip()
        if not normalized:
            return None

        patterns = [
            r'drive\.google\.com/file/d/([a-zA-Z0-9_-]+)',
            r'drive\.google\.com/open\?id=([a-zA-Z0-9_-]+)',
            r'[?&]id=([a-zA-Z0-9_-]+)',
        ]

        for pattern in patterns:
            match = re.search(pattern, normalized)
            if match:
                return match.group(1)

        # Fallback for cases where only the Drive file id is stored.
        if re.fullmatch(r'[a-zA-Z0-9_-]{20,}', normalized):
            return normalized

        return None

    def _to_displayable_photo_url(self, *, value, check_in_id, photo_kind):
        normalized = str(value or '').strip()
        if not normalized:
            return None

        file_id = self._extract_google_drive_file_id(normalized)
        if file_id:
            request = self.context.get('request')
            proxy_path = f'/api/attendance/{check_in_id}/photo/{photo_kind}/'
            if request:
                return request.build_absolute_uri(proxy_path)
            return proxy_path

        return normalized

    def _safe_folder_name(self, value):
        normalized = re.sub(r'\s+', ' ', str(value or '').strip())
        normalized = normalized.replace('/', '-').replace('\\', '-')
        return normalized or 'unknown'

    def _resolve_display_name(self, user):
        display_name = _compose_name(user.first_name, user.last_name)
        return display_name or user.username or f'tutor-{user.id}'

    def _resolve_student_name(self, student):
        display_name = _compose_name(student.first_name, student.last_name)
        return display_name or str(student.id)

    def _get_photo_extension(self, photo_file):
        ext = Path(photo_file.name or '').suffix.lower()
        if ext == '.jpeg':
            ext = '.jpg'

        if ext not in {'.jpg', '.png'}:
            content_type = (getattr(photo_file, 'content_type', '') or '').lower()
            if content_type in {'image/jpeg', 'image/jpg'}:
                ext = '.jpg'
            elif content_type == 'image/png':
                ext = '.png'

        if ext not in {'.jpg', '.png'}:
            raise serializers.ValidationError('Only JPG and PNG images are supported for attendance photos.')

        return ext.lstrip('.')

    def _upload_photo_to_drive(self, *, photo_file, check_type, check_time, tutor, student, schedule):
        folder_month_year = check_time.strftime('%m-%Y')
        folder_date = check_time.strftime('%Y-%m-%d')
        tutor_name = self._safe_folder_name(self._resolve_display_name(tutor))
        student_name = self._safe_folder_name(self._resolve_student_name(student))
        schedule_id = schedule.id if schedule else 'no-schedule'
        attendance_folder = f'{tutor_name}-{student_name}-{schedule_id}'

        extension = self._get_photo_extension(photo_file)
        file_name = f'{check_type}.{extension}'
        folder_parts = [folder_month_year, folder_date, attendance_folder]

        try:
            uploader = GoogleDriveUploader()
            return uploader.upload_file(file_obj=photo_file, folder_parts=folder_parts, file_name=file_name)
        except GoogleDriveUploadError as exc:
            raise serializers.ValidationError({'detail': f'Failed to upload attendance photo to Google Drive: {exc}'}) from exc

    def _upsert_checkout(self, check_in, check_out_photo=None, check_out_time=None):
        if not check_out_photo and not check_out_time:
            return

        defaults = {}
        if check_out_photo is not None:
            checkout_time_value = check_out_time or timezone.now()
            try:
                schedule = check_in.schedule
            except Schedule.DoesNotExist:
                schedule = None

            defaults['check_out_photo'] = self._upload_photo_to_drive(
                photo_file=check_out_photo,
                check_type='CHECK_OUT',
                check_time=checkout_time_value,
                tutor=check_in.tutor,
                student=check_in.student,
                schedule=schedule,
            )
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
        check_in_photo = validated_data.pop('check_in_photo', None)
        check_out_photo = validated_data.pop('check_out_photo', None)
        check_out_time = validated_data.pop('check_out_time', None)

        if is_tutor(request.user):
            validated_data['tutor'] = request.user

        tutor = validated_data.get('tutor')
        if not tutor:
            raise serializers.ValidationError({'tutor': 'Tutor is required.'})

        check_in_time = validated_data.get('check_in_time') or timezone.now()
        validated_data['check_in_photo'] = self._upload_photo_to_drive(
            photo_file=check_in_photo,
            check_type='CHECK_IN',
            check_time=check_in_time,
            tutor=tutor,
            student=validated_data['student'],
            schedule=schedule,
        )

        check_in = CheckIn.objects.create(**validated_data)

        if schedule:
            schedule.check_in = check_in
            schedule.save(update_fields=['check_in'])

        self._upsert_checkout(check_in, check_out_photo, check_out_time)
        return check_in

    def update(self, instance, validated_data):
        request = self.context.get('request')
        check_in_photo = validated_data.pop('check_in_photo', None)
        check_out_photo = validated_data.pop('check_out_photo', None)
        check_out_time = validated_data.pop('check_out_time', None)

        if is_tutor(request.user):
            validated_data['tutor'] = request.user

        if check_in_photo is not None:
            try:
                schedule = instance.schedule
            except Schedule.DoesNotExist:
                schedule = None

            check_in_time = validated_data.get('check_in_time') or instance.check_in_time or timezone.now()
            validated_data['check_in_photo'] = self._upload_photo_to_drive(
                photo_file=check_in_photo,
                check_type='CHECK_IN',
                check_time=check_in_time,
                tutor=validated_data.get('tutor', instance.tutor),
                student=validated_data.get('student', instance.student),
                schedule=schedule,
            )

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        self._upsert_checkout(instance, check_out_photo, check_out_time)
        return instance


class ScheduleSerializer(serializers.ModelSerializer):
    tutor = serializers.PrimaryKeyRelatedField(queryset=User.objects.all())
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
            'tutor',
            'tutor_name',
            'student',
            'student_name',
            'subject_topic',
            'scheduled_at',
            'status',
            'check_in_id',
            'check_out_id',
            'check_in_detail',
            'check_out_detail',
        ]

    def validate_tutor(self, tutor):
        if is_admin(tutor):
            raise serializers.ValidationError('Tutor must be a non-admin user.')
        return tutor

    def validate_student(self, student):
        if not Student.objects.filter(id=student.id).exists():
            raise serializers.ValidationError('Student with this id does not exist.')
        return student

    @extend_schema_field(serializers.CharField())
    def get_tutor_name(self, obj):
        display_name = _compose_name(obj.tutor.first_name, obj.tutor.last_name)
        return display_name or obj.tutor.username

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_student_name(self, obj):
        student = getattr(obj, 'student', None)
        if not student:
            return None

        return _compose_name(student.first_name, student.last_name) or f'#{student.id}'

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
        return str(file_field)

    @extend_schema_field(
        {
            'type': 'object',
            'nullable': True,
            'properties': {
                'id': {'type': 'integer'},
                'time': {'type': 'string', 'format': 'date-time'},
                'location': {'type': 'string', 'format': 'uri'},
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
            'location': build_location_search_url(check_in.check_in_location),
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
