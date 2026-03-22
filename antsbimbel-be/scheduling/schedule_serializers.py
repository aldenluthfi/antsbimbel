from django.contrib.auth import get_user_model
from datetime import timedelta
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from .location_utils import build_location_search_url
from .models import Student, Schedule
from .permissions import is_admin
from .serialization_utils import compose_name


User = get_user_model()


class ScheduleSerializer(serializers.ModelSerializer):
    MINIMUM_SCHEDULE_DURATION = timedelta(hours=2)
    tutor = serializers.PrimaryKeyRelatedField(queryset=User.objects.all())
    tutor_name = serializers.SerializerMethodField()
    student_name = serializers.SerializerMethodField()
    check_in_id = serializers.SerializerMethodField()
    check_out_id = serializers.SerializerMethodField()
    check_in_detail = serializers.SerializerMethodField()
    check_out_detail = serializers.SerializerMethodField()
    can_check_in = serializers.SerializerMethodField()

    class Meta:
        model = Schedule
        fields = [
            'id',
            'tutor',
            'tutor_name',
            'student',
            'student_name',
            'subject_topic',
            'description',
            'start_datetime',
            'end_datetime',
            'status',
            'check_in_id',
            'check_out_id',
            'check_in_detail',
            'check_out_detail',
            'can_check_in',
        ]

    def validate(self, attrs):
        start_datetime = attrs.get('start_datetime')
        end_datetime = attrs.get('end_datetime')

        if self.instance is not None:
            if start_datetime is None:
                start_datetime = self.instance.start_datetime
            if end_datetime is None:
                end_datetime = self.instance.end_datetime

        if start_datetime and end_datetime:
            if start_datetime >= end_datetime:
                raise serializers.ValidationError({'end_datetime': 'End datetime must be after start datetime.'})

            if start_datetime.date() != end_datetime.date():
                raise serializers.ValidationError(
                    {'end_datetime': 'Start datetime and end datetime must be on the same date.'}
                )

            if end_datetime - start_datetime < self.MINIMUM_SCHEDULE_DURATION:
                raise serializers.ValidationError({'end_datetime': 'Schedule duration must be at least 2 hours.'})

        return attrs

    def validate_status(self, status_value):
        if status_value in {Schedule.STATUS_RESCHEDULED, Schedule.STATUS_MISSED}:
            raise serializers.ValidationError('Status "rescheduled" and "missed" are managed by the system and cannot be set manually.')
        return status_value

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
        display_name = compose_name(obj.tutor.first_name, obj.tutor.last_name)
        return display_name or obj.tutor.username

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_student_name(self, obj):
        student = getattr(obj, 'student', None)
        if not student:
            return None

        return compose_name(student.first_name, student.last_name) or f'#{student.id}'

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
                'description': {'type': 'string'},
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
            'description': check_in.description,
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

    @extend_schema_field(serializers.BooleanField())
    def get_can_check_in(self, obj):
        return obj.can_check_in
