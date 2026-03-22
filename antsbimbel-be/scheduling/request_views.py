from datetime import datetime, timedelta

from django.db.models import Q
from django.db.models.functions import Coalesce
from django.utils import timezone
from django.utils.dateparse import parse_date
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .api_parameters import REQUEST_CALENDAR_PAGINATION_QUERY_PARAMETERS, REQUEST_LIST_QUERY_PARAMETERS
from .models import Request, Schedule
from .pagination import StandardResultsSetPagination
from .permissions import RequestPermission, is_admin, is_tutor
from .request_serializers import RequestSerializer


class RequestViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Request.objects.select_related(
        'old_schedule',
        'old_schedule__tutor',
        'old_schedule__student',
        'new_schedule',
        'new_schedule__tutor',
        'new_schedule__student',
    ).all().order_by('-created_at')
    serializer_class = RequestSerializer
    permission_classes = [IsAuthenticated, RequestPermission]
    pagination_class = StandardResultsSetPagination

    ALLOWED_REQUEST_STATUS = {
        Request.STATUS_PENDING,
        Request.STATUS_RESOLVED,
    }

    @staticmethod
    def _parse_status_filters(raw_values):
        parsed_values = []
        for raw_value in raw_values:
            for status_piece in str(raw_value).split(','):
                normalized_status = status_piece.strip().lower()
                if normalized_status:
                    parsed_values.append(normalized_status)

        # Keep input order while dropping duplicates.
        return list(dict.fromkeys(parsed_values))

    @staticmethod
    def _local_day_start(day_value):
        return timezone.make_aware(
            datetime.combine(day_value, datetime.min.time()),
            timezone.get_current_timezone(),
        )

    @classmethod
    def _schedule_date_range_q(cls, start_date, end_date):
        start_datetime = cls._local_day_start(start_date)
        next_day_datetime = cls._local_day_start(end_date + timedelta(days=1))
        return (
            Q(new_schedule__start_datetime__gte=start_datetime)
            & Q(new_schedule__start_datetime__lt=next_day_datetime)
        ) | (
            Q(new_schedule__isnull=True)
            & Q(old_schedule__start_datetime__gte=start_datetime)
            & Q(old_schedule__start_datetime__lt=next_day_datetime)
        )

    @staticmethod
    def _with_effective_schedule_annotations(queryset):
        return queryset.annotate(
            effective_start_datetime=Coalesce('new_schedule__start_datetime', 'old_schedule__start_datetime'),
            effective_end_datetime=Coalesce('new_schedule__end_datetime', 'old_schedule__end_datetime'),
        )

    def _resolve_ordering(self, sort_by, sort_order):
        ordering_fields = {
            'created_at': 'created_at',
            'start_datetime': 'effective_start_datetime',
            'end_datetime': 'effective_end_datetime',
            'status': 'status',
        }

        if sort_by not in ordering_fields:
            raise ValidationError(
                {'sort_by': 'Invalid sort field. Allowed values are created_at, start_datetime, end_datetime, status.'}
            )

        if sort_order not in {'asc', 'desc'}:
            sort_order = 'desc'

        field_name = ordering_fields[sort_by]
        return field_name if sort_order == 'asc' else f'-{field_name}'

    @extend_schema(parameters=REQUEST_LIST_QUERY_PARAMETERS)
    def list(self, request, *args, **kwargs):
        queryset = self._with_effective_schedule_annotations(self.filter_queryset(self.get_queryset()))
        sort_by = request.query_params.get('sort_by', 'created_at').strip().lower()
        sort_order = request.query_params.get('sort_order', '').strip().lower()
        queryset = queryset.order_by(self._resolve_ordering(sort_by, sort_order))

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @extend_schema(
        request=None,
        parameters=REQUEST_CALENDAR_PAGINATION_QUERY_PARAMETERS,
        responses={
            200: inline_serializer(
                name='RequestCalendarPaginationResponse',
                fields={
                    'mode': serializers.CharField(),
                    'cursor_date': serializers.CharField(),
                    'period_start': serializers.CharField(),
                    'period_end': serializers.CharField(),
                    'previous_cursor_date': serializers.CharField(),
                    'next_cursor_date': serializers.CharField(),
                    'count': serializers.IntegerField(),
                    'results': RequestSerializer(many=True),
                },
            ),
        },
    )
    @action(detail=False, methods=['get'], url_path='calendar-pagination')
    def calendar_pagination(self, request):
        queryset = self._with_effective_schedule_annotations(self.filter_queryset(self.get_queryset()))
        sort_by = request.query_params.get('sort_by', 'created_at').strip().lower()
        sort_order = request.query_params.get('sort_order', '').strip().lower()
        mode = request.query_params.get('mode', 'month').strip().lower()
        cursor_date_param = request.query_params.get('cursor_date', '').strip()

        if mode not in {'month', 'week'}:
            raise ValidationError({'mode': 'Invalid calendar mode. Allowed values are month, week.'})

        cursor_date = parse_date(cursor_date_param) if cursor_date_param else timezone.localdate()
        if not cursor_date:
            raise ValidationError({'cursor_date': 'Invalid date format. Use YYYY-MM-DD.'})

        if mode == 'month':
            period_start = cursor_date.replace(day=1)
            if period_start.month == 12:
                next_month_start = period_start.replace(year=period_start.year + 1, month=1)
            else:
                next_month_start = period_start.replace(month=period_start.month + 1)
            period_end = next_month_start - timedelta(days=1)
            previous_cursor_date = period_start - timedelta(days=1)
            next_cursor_date = next_month_start
        else:
            period_start = cursor_date - timedelta(days=cursor_date.weekday())
            period_end = period_start + timedelta(days=6)
            previous_cursor_date = period_start - timedelta(days=7)
            next_cursor_date = period_start + timedelta(days=7)

        period_queryset = queryset.filter(
            self._schedule_date_range_q(period_start, period_end)
        ).order_by(self._resolve_ordering(sort_by, sort_order))

        serializer = self.get_serializer(period_queryset, many=True)
        return Response(
            {
                'mode': mode,
                'cursor_date': cursor_date.isoformat(),
                'period_start': period_start.isoformat(),
                'period_end': period_end.isoformat(),
                'previous_cursor_date': previous_cursor_date.isoformat(),
                'next_cursor_date': next_cursor_date.isoformat(),
                'count': period_queryset.count(),
                'results': serializer.data,
            }
        )

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user

        if not is_admin(user) and not is_tutor(user):
            return queryset.none()

        if is_tutor(user):
            queryset = queryset.filter(Q(new_schedule__tutor=user) | Q(old_schedule__tutor=user))

        tutor = self.request.query_params.get('tutor')
        student = self.request.query_params.get('student')
        start_date_param = self.request.query_params.get('start_date')
        end_date_param = self.request.query_params.get('end_date')
        raw_status_values = self.request.query_params.getlist('status')

        if tutor:
            queryset = queryset.filter(Q(new_schedule__tutor=tutor) | Q(old_schedule__tutor=tutor))

        if student:
            queryset = queryset.filter(Q(new_schedule__student=student) | Q(old_schedule__student=student))

        if start_date_param:
            start_date = parse_date(start_date_param)
            if not start_date:
                raise ValidationError({'start_date': 'Invalid date format. Use YYYY-MM-DD or ISO datetime.'})
            day_start = self._local_day_start(start_date)
            queryset = queryset.filter(
                Q(new_schedule__start_datetime__gte=day_start)
                | (Q(new_schedule__isnull=True) & Q(old_schedule__start_datetime__gte=day_start))
            )

        if end_date_param:
            end_date = parse_date(end_date_param)
            if not end_date:
                raise ValidationError({'end_date': 'Invalid date format. Use YYYY-MM-DD or ISO datetime.'})
            next_day_start = self._local_day_start(end_date + timedelta(days=1))
            queryset = queryset.filter(
                Q(new_schedule__start_datetime__lt=next_day_start)
                | (Q(new_schedule__isnull=True) & Q(old_schedule__start_datetime__lt=next_day_start))
            )

        status_values = self._parse_status_filters(raw_status_values)
        if status_values:
            invalid_status_values = sorted(set(status_values) - self.ALLOWED_REQUEST_STATUS)
            if invalid_status_values:
                raise ValidationError(
                    {
                        'status': (
                            'Invalid status value(s). Allowed values are pending, resolved. '
                            'You can pass multiple values as repeated status params or a comma-separated list.'
                        )
                    }
                )
            queryset = queryset.filter(status__in=status_values)

        return queryset

    @extend_schema(
        request=None,
        responses={
            200: RequestSerializer,
            400: inline_serializer(
                name='RequestApproveValidationError',
                fields={'detail': serializers.CharField()},
            ),
            403: inline_serializer(
                name='RequestApprovePermissionError',
                fields={'detail': serializers.CharField()},
            ),
        },
    )
    @action(detail=True, methods=['post'], url_path='approve')
    def approve(self, request, pk=None):
        if not is_admin(request.user):
            return Response({'detail': 'Only admins can approve requests.'}, status=status.HTTP_403_FORBIDDEN)

        request_obj = self.get_object()
        new_schedule = request_obj.new_schedule
        old_schedule = request_obj.old_schedule

        if request_obj.status != Request.STATUS_PENDING:
            raise ValidationError({'detail': 'Only pending requests can be approved.'})

        if request_obj.extension is not None:
            if not old_schedule:
                raise ValidationError({'detail': 'Extension requests require an old schedule.'})

            if old_schedule.status != Schedule.STATUS_PENDING:
                raise ValidationError({'detail': 'Only pending requests can be approved.'})

            old_schedule.end_datetime = old_schedule.end_datetime + timedelta(hours=request_obj.extension)
            old_schedule.status = Schedule.STATUS_EXTENDED
            old_schedule.save(update_fields=['end_datetime', 'status'])
            request_obj.status = Request.STATUS_RESOLVED
            request_obj.save(update_fields=['status', 'updated_at'])
            return Response(self.get_serializer(request_obj).data, status=status.HTTP_200_OK)

        if not new_schedule:
            raise ValidationError({'detail': 'Reschedule request does not have a new schedule.'})

        if new_schedule.status != Schedule.STATUS_PENDING:
            raise ValidationError({'detail': 'Only pending requests can be approved.'})

        if old_schedule and old_schedule.status == Schedule.STATUS_PENDING:
            old_schedule.status = Schedule.STATUS_RESCHEDULED
            old_schedule.save(update_fields=['status'])

        new_schedule.status = Schedule.STATUS_UPCOMING
        new_schedule.save(update_fields=['status'])
        request_obj.status = Request.STATUS_RESOLVED
        request_obj.save(update_fields=['status', 'updated_at'])

        return Response(self.get_serializer(request_obj).data, status=status.HTTP_200_OK)

    @extend_schema(
        request=None,
        responses={
            200: RequestSerializer,
            400: inline_serializer(
                name='RequestRejectValidationError',
                fields={'detail': serializers.CharField()},
            ),
            403: inline_serializer(
                name='RequestRejectPermissionError',
                fields={'detail': serializers.CharField()},
            ),
        },
    )
    @action(detail=True, methods=['post'], url_path='reject')
    def reject(self, request, pk=None):
        if not is_admin(request.user):
            return Response({'detail': 'Only admins can reject requests.'}, status=status.HTTP_403_FORBIDDEN)

        request_obj = self.get_object()
        new_schedule = request_obj.new_schedule
        old_schedule = request_obj.old_schedule

        if request_obj.status != Request.STATUS_PENDING:
            raise ValidationError({'detail': 'Only pending requests can be rejected.'})

        if request_obj.extension is not None:
            if not old_schedule:
                raise ValidationError({'detail': 'Extension requests require an old schedule.'})

            old_schedule.status = Schedule.STATUS_UPCOMING
            old_schedule.save(update_fields=['status'])
            request_obj.status = Request.STATUS_RESOLVED
            request_obj.save(update_fields=['status', 'updated_at'])
            return Response(self.get_serializer(request_obj).data, status=status.HTTP_200_OK)

        if not new_schedule:
            raise ValidationError({'detail': 'Reschedule request does not have a new schedule.'})

        if new_schedule.status != Schedule.STATUS_PENDING:
            raise ValidationError({'detail': 'Only pending requests can be rejected.'})

        new_schedule.status = Schedule.STATUS_REJECTED
        new_schedule.save(update_fields=['status'])
        request_obj.status = Request.STATUS_RESOLVED
        request_obj.save(update_fields=['status', 'updated_at'])

        return Response(self.get_serializer(request_obj).data, status=status.HTTP_200_OK)
