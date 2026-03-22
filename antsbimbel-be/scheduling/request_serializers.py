from rest_framework import serializers

from .models import Request
from .schedule_serializers import ScheduleSerializer


class RequestSerializer(serializers.ModelSerializer):
    old_schedule_detail = ScheduleSerializer(source='old_schedule', read_only=True)
    new_schedule_detail = ScheduleSerializer(source='new_schedule', read_only=True)

    class Meta:
        model = Request
        fields = [
            'id',
            'status',
            'old_schedule',
            'new_schedule',
            'extension',
            'old_schedule_detail',
            'new_schedule_detail',
            'created_at',
            'updated_at',
        ]
