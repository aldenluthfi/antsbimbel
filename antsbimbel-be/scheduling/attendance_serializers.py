from datetime import timedelta
from pathlib import Path
import re

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from .google_drive import GoogleDriveUploadError, GoogleDriveUploader
from .drive_paths import attendance_folder_parts
from .location_utils import build_location_search_url
from .models import CheckIn, CheckOut, Schedule, Student
from .permissions import is_admin, is_tutor
from .serialization_utils import compose_name


User = get_user_model()


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
            'description',
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

        if schedule.status not in {Schedule.STATUS_UPCOMING, Schedule.STATUS_PENDING}:
            raise serializers.ValidationError('Check-in can only be linked to upcoming or pending schedules.')

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

            start_datetime = schedule.start_datetime
            if timezone.is_naive(start_datetime):
                start_datetime = timezone.make_aware(start_datetime, timezone.get_current_timezone())

            earliest_check_in = start_datetime - timedelta(minutes=15)
            if check_in_time < earliest_check_in:
                raise serializers.ValidationError(
                    {'check_in_time': 'Tutors can only check in at most 15 minutes before the schedule time.'}
                )

        if attrs.get('check_out_photo') is not None or attrs.get('check_out_time') is not None:
            resolved_schedule = schedule
            if not resolved_schedule and self.instance is not None:
                try:
                    resolved_schedule = self.instance.schedule
                except Schedule.DoesNotExist:
                    resolved_schedule = None

            if resolved_schedule:
                check_out_time = attrs.get('check_out_time') or timezone.now()
                if timezone.is_naive(check_out_time):
                    check_out_time = timezone.make_aware(check_out_time, timezone.get_current_timezone())

                end_datetime = resolved_schedule.end_datetime
                if timezone.is_naive(end_datetime):
                    end_datetime = timezone.make_aware(end_datetime, timezone.get_current_timezone())

                earliest_check_out = end_datetime - timedelta(minutes=15)
                latest_check_out = end_datetime + timedelta(minutes=30)
                if check_out_time < earliest_check_out or check_out_time > latest_check_out:
                    raise serializers.ValidationError(
                        {
                            'check_out_time': (
                                'Tutors can only check out from 15 minutes before '
                                'until 30 minutes after the schedule end time.'
                            )
                        }
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

    def _resolve_display_name(self, user):
        display_name = compose_name(user.first_name, user.last_name)
        return display_name or user.username or f'tutor-{user.id}'

    def _resolve_student_name(self, student):
        display_name = compose_name(student.first_name, student.last_name)
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
        tutor_name = self._resolve_display_name(tutor)
        student_name = self._resolve_student_name(student)
        schedule_id = schedule.id if schedule else 'no-schedule'

        extension = self._get_photo_extension(photo_file)
        file_name = f'{check_type}.{extension}'
        folder_parts = attendance_folder_parts(
            check_time=check_time,
            tutor_name=tutor_name,
            student_name=student_name,
            schedule_id=schedule_id,
        )

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
