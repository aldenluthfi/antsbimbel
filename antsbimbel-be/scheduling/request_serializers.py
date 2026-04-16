from rest_framework import serializers

from .models import Request
from .schedule_serializers import ScheduleSerializer


class RequestSerializer(serializers.ModelSerializer):
    old_schedule_detail = ScheduleSerializer(source='old_schedule', read_only=True)
    new_schedule_details = ScheduleSerializer(source='new_schedules', many=True, read_only=True)

    class Meta:
        model = Request
        fields = [
            'id',
            'request_type',
            'description',
            'status',
            'old_schedule',
            'new_schedules',
            'extension',
            'old_schedule_detail',
            'new_schedule_details',
            'created_at',
            'updated_at',
        ]
