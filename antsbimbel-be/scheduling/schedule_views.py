import csv
import io
from datetime import datetime, timedelta

from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from django.utils.dateparse import parse_date
from drf_spectacular.utils import OpenApiExample, extend_schema, inline_serializer
from rest_framework.decorators import action
from rest_framework import serializers, status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .api_parameters import CALENDAR_PAGINATION_QUERY_PARAMETERS, SCHEDULE_LIST_QUERY_PARAMETERS
from .auth_serializers import MessageSerializer
from .drive_paths import report_file_name, report_folder_parts
from .email_blast import get_admin_blast_permission_state, send_admin_schedule_blast
from .google_drive import GoogleDriveUploadError, GoogleDriveUploader
from .location_utils import build_location_search_url
from .models import EmailBlastRecord, Request, Schedule, Student
from .pagination import StandardResultsSetPagination
from .permissions import SchedulePermission, is_admin, is_tutor
from .schedule_serializers import ScheduleSerializer


class TutorScheduleRequestPayloadSerializer(serializers.Serializer):
    student = serializers.IntegerField(required=True)
    subject_topic = serializers.CharField(required=True)
    description = serializers.CharField(required=True, allow_blank=False)
    start_datetime = serializers.DateTimeField(required=True)
    end_datetime = serializers.DateTimeField(required=True)


class TutorCancelRequestPayloadSerializer(serializers.Serializer):
    description = serializers.CharField(required=True, allow_blank=False)


class EmailBlastPayloadSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=[EmailBlastRecord.TYPE_DAILY, EmailBlastRecord.TYPE_WEEKLY])


class EmailBlastPermissionSerializer(serializers.Serializer):
    can_daily = serializers.BooleanField()
    can_weekly = serializers.BooleanField()


class TutorScheduleRequestResponseSerializer(serializers.Serializer):
    request_id = serializers.IntegerField()
    request_count = serializers.IntegerField()
    schedule = ScheduleSerializer()


class EmailBlastResponseSerializer(serializers.Serializer):
    detail = serializers.CharField()
    mode = serializers.ChoiceField(choices=[EmailBlastRecord.TYPE_DAILY, EmailBlastRecord.TYPE_WEEKLY])
    period_start = serializers.DateField()
    period_end = serializers.DateField()
    sent_count = serializers.IntegerField()
    failed_count = serializers.IntegerField()
    permission = EmailBlastPermissionSerializer()


class ScheduleViewSet(viewsets.ModelViewSet):
    queryset = Schedule.objects.select_related('tutor', 'check_in', 'check_in__check_out').all().order_by('-start_datetime')
    serializer_class = ScheduleSerializer
    permission_classes = [IsAuthenticated, SchedulePermission]
    pagination_class = StandardResultsSetPagination
    ALLOWED_SCHEDULE_STATUS = {
        Schedule.STATUS_UPCOMING,
        Schedule.STATUS_DONE,
        Schedule.STATUS_AUTODONE,
        Schedule.STATUS_MISSED,
        Schedule.STATUS_CANCELLED,
        Schedule.STATUS_RESCHEDULED,
        Schedule.STATUS_PENDING,
        Schedule.STATUS_REJECTED,
    }
    TUTOR_RESCHEDULABLE_STATUS = {
        Schedule.STATUS_UPCOMING,
        Schedule.STATUS_PENDING,
    }
    MINIMUM_SCHEDULE_DURATION = timedelta(hours=2)
    SESSION_DURATION = timedelta(hours=2)

    @staticmethod
    def _is_past_start_datetime(start_datetime):
        localized_schedule = timezone.localtime(start_datetime)
        localized_now = timezone.localtime(timezone.now())
        return localized_schedule < localized_now

    def _validate_not_past(self, start_datetime, error_message):
        if self._is_past_start_datetime(start_datetime):
            raise ValidationError({'start_datetime': error_message})

    @staticmethod
    def _validate_schedule_window(start_datetime, end_datetime):
        if start_datetime >= end_datetime:
            raise ValidationError({'end_datetime': 'End datetime must be after start datetime.'})

        if timezone.localtime(start_datetime).date() != timezone.localtime(end_datetime).date():
            raise ValidationError({'end_datetime': 'Start datetime and end datetime must be on the same date.'})

        schedule_duration = end_datetime - start_datetime
        if schedule_duration < ScheduleViewSet.MINIMUM_SCHEDULE_DURATION:
            raise ValidationError({'end_datetime': 'Schedule duration must be at least 2 hours.'})

        if schedule_duration % ScheduleViewSet.SESSION_DURATION != timedelta(0):
            raise ValidationError({'end_datetime': 'Schedule duration must be in multiples of 2 hours.'})

        if schedule_duration != ScheduleViewSet.SESSION_DURATION:
            raise ValidationError({'end_datetime': 'Schedule duration must be exactly 2 hours.'})

    @staticmethod
    def _clone_schedule(schedule, *, start_datetime, end_datetime, status):
        return Schedule.objects.create(
            tutor=schedule.tutor,
            student=schedule.student,
            subject_topic=schedule.subject_topic,
            description=schedule.description,
            start_datetime=start_datetime,
            end_datetime=end_datetime,
            status=status,
        )

    @staticmethod
    def _validate_request_tutor_consistency(old_schedule, new_schedules):
        tutor_ids = set()
        if old_schedule is not None:
            tutor_ids.add(old_schedule.tutor_id)

        for schedule in new_schedules or []:
            tutor_ids.add(schedule.tutor_id)

        if len(tutor_ids) > 1:
            raise ValidationError({'detail': 'All schedules in a request must be assigned to the same tutor.'})

    @staticmethod
    def _create_request(*, old_schedule, new_schedules, request_type, description, extension=None):
        ScheduleViewSet._validate_request_tutor_consistency(old_schedule, new_schedules)

        request_obj = Request.objects.create(
            old_schedule=old_schedule,
            request_type=request_type,
            description=description,
            extension=extension,
        )
        if new_schedules:
            request_obj.new_schedules.add(*new_schedules)
        return request_obj

    @classmethod
    def _split_into_session_windows(cls, start_datetime, end_datetime):
        cls._validate_schedule_window(start_datetime, end_datetime)
        return [(start_datetime, end_datetime)]

    @classmethod
    def _create_split_schedules(
        cls,
        *,
        tutor,
        student,
        subject_topic,
        description,
        start_datetime,
        end_datetime,
        status,
    ):
        windows = cls._split_into_session_windows(start_datetime, end_datetime)
        created_schedules = []

        for window_start, window_end in windows:
            created_schedules.append(
                Schedule.objects.create(
                    tutor=tutor,
                    student=student,
                    subject_topic=subject_topic,
                    description=description,
                    start_datetime=window_start,
                    end_datetime=window_end,
                    status=status,
                )
            )

        return created_schedules

    @classmethod
    def _create_extension_request_schedules(cls, old_schedule, next_end_datetime):
        extension_delta = next_end_datetime - old_schedule.end_datetime
        if extension_delta <= timedelta(0):
            raise ValidationError({'end_datetime': 'End datetime must be later than the current end datetime when extending.'})

        if extension_delta % cls.SESSION_DURATION != timedelta(0):
            raise ValidationError({'end_datetime': 'Schedule extension must be in multiples of 2 hours.'})

        extension_windows = []
        cursor_start = old_schedule.end_datetime
        while cursor_start + cls.SESSION_DURATION <= next_end_datetime:
            cursor_end = cursor_start + cls.SESSION_DURATION
            extension_windows.append((cursor_start, cursor_end))
            cursor_start = cursor_end

        created_schedules = []
        for window_start, window_end in extension_windows:
            next_schedule = cls._clone_schedule(
                old_schedule,
                start_datetime=window_start,
                end_datetime=window_end,
                status=Schedule.STATUS_PENDING,
            )
            created_schedules.append(next_schedule)

        return created_schedules

    @staticmethod
    def _local_day_start(day_value):
        return timezone.make_aware(
            datetime.combine(day_value, datetime.min.time()),
            timezone.get_current_timezone(),
        )

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

    @classmethod
    def _local_date_range_kwargs(cls, start_date, end_date):
        return {
            'start_datetime__gte': cls._local_day_start(start_date),
            'start_datetime__lt': cls._local_day_start(end_date + timedelta(days=1)),
        }

    @staticmethod
    def _to_hyperlink_formula(url, label):
        if not url:
            return ''
        safe_url = str(url).replace('"', '""')
        safe_label = str(label).replace('"', '""')
        return f'=HYPERLINK("{safe_url}","{safe_label}")'

    @staticmethod
    def _mark_overdue_upcoming_as_missed():
        overdue_cutoff = timezone.now() - timedelta(minutes=30)
        Schedule.objects.filter(
            status__in={
                Schedule.STATUS_UPCOMING,
                Schedule.STATUS_PENDING,
            },
            start_datetime__lt=overdue_cutoff,
            check_in__isnull=True,
        ).update(status=Schedule.STATUS_MISSED)

    @staticmethod
    def _auto_checkout_elapsed_schedules():
        checkout_elapsed_cutoff = timezone.now() - timedelta(minutes=30)
        Schedule.objects.filter(
            status__in={
                Schedule.STATUS_UPCOMING,
                Schedule.STATUS_PENDING,
            },
            end_datetime__lt=checkout_elapsed_cutoff,
            check_in__isnull=False,
            check_in__check_out__isnull=True,
        ).update(status=Schedule.STATUS_AUTODONE)

    @extend_schema(parameters=SCHEDULE_LIST_QUERY_PARAMETERS)
    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        sort_by = request.query_params.get('sort_by', 'start_datetime').strip().lower()
        sort_order = request.query_params.get('sort_order', '').strip().lower()

        if sort_by not in {'start_datetime', 'end_datetime', 'status'}:
            raise ValidationError({'sort_by': 'Invalid sort field. Allowed values are start_datetime, end_datetime, status.'})

        if sort_order not in {'asc', 'desc'}:
            sort_order = 'desc'

        order_by_field = sort_by if sort_order == 'asc' else f'-{sort_by}'
        queryset = queryset.order_by(order_by_field)

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @extend_schema(
        request=None,
        parameters=CALENDAR_PAGINATION_QUERY_PARAMETERS,
        responses={
            200: inline_serializer(
                name='ScheduleCalendarPaginationResponse',
                fields={
                    'mode': serializers.CharField(),
                    'cursor_date': serializers.CharField(),
                    'period_start': serializers.CharField(),
                    'period_end': serializers.CharField(),
                    'previous_cursor_date': serializers.CharField(),
                    'next_cursor_date': serializers.CharField(),
                    'count': serializers.IntegerField(),
                    'results': ScheduleSerializer(many=True),
                },
            ),
        },
    )
    @action(detail=False, methods=['get'], url_path='calendar-pagination')
    def calendar_pagination(self, request):
        queryset = self.filter_queryset(self.get_queryset())
        sort_by = request.query_params.get('sort_by', 'start_datetime').strip().lower()
        sort_order = request.query_params.get('sort_order', '').strip().lower()
        mode = request.query_params.get('mode', 'month').strip().lower()
        cursor_date_param = request.query_params.get('cursor_date', '').strip()

        if sort_by not in {'start_datetime', 'end_datetime', 'status'}:
            raise ValidationError({'sort_by': 'Invalid sort field. Allowed values are start_datetime, end_datetime, status.'})

        if sort_order not in {'asc', 'desc'}:
            sort_order = 'desc'

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
            # Week view is Monday-Sunday to match the frontend calendar board.
            period_start = cursor_date - timedelta(days=cursor_date.weekday())
            period_end = period_start + timedelta(days=6)
            previous_cursor_date = period_start - timedelta(days=7)
            next_cursor_date = period_start + timedelta(days=7)

        order_by_field = sort_by if sort_order == 'asc' else f'-{sort_by}'
        period_queryset = queryset.filter(
            **self._local_date_range_kwargs(period_start, period_end)
        ).order_by(order_by_field)

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
        self._mark_overdue_upcoming_as_missed()
        self._auto_checkout_elapsed_schedules()
        queryset = super().get_queryset()
        user = self.request.user

        if not is_admin(user) and not is_tutor(user):
            return queryset.none()

        if is_tutor(user):
            queryset = queryset.filter(tutor=user)

        tutor = self.request.query_params.get('tutor')
        student = self.request.query_params.get('student')
        start_date_param = self.request.query_params.get('start_date')
        end_date_param = self.request.query_params.get('end_date')
        raw_status_values = self.request.query_params.getlist('status')

        if tutor:
            queryset = queryset.filter(tutor=tutor)

        if student:
            queryset = queryset.filter(student=student)

        if start_date_param:
            start_date = parse_date(start_date_param)
            if not start_date:
                raise ValidationError({'start_date': 'Invalid date format. Use YYYY-MM-DD or ISO datetime.'})
            queryset = queryset.filter(start_datetime__gte=self._local_day_start(start_date))

        if end_date_param:
            end_date = parse_date(end_date_param)
            if not end_date:
                raise ValidationError({'end_date': 'Invalid date format. Use YYYY-MM-DD or ISO datetime.'})
            queryset = queryset.filter(start_datetime__lt=self._local_day_start(end_date + timedelta(days=1)))

        status_values = self._parse_status_filters(raw_status_values)
        if status_values:
            invalid_status_values = sorted(set(status_values) - self.ALLOWED_SCHEDULE_STATUS)
            if invalid_status_values:
                raise ValidationError(
                    {
                        'status': (
                            'Invalid status value(s). Allowed values are upcoming, done, autodone, missed, '
                            'cancelled, rescheduled, pending, rejected. '
                            'You can pass multiple values as repeated status params or a comma-separated list.'
                        )
                    }
                )
            queryset = queryset.filter(status__in=status_values)

        return queryset

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        start_datetime = serializer.validated_data['start_datetime']
        end_datetime = serializer.validated_data['end_datetime']
        self._validate_schedule_window(start_datetime, end_datetime)
        self._validate_not_past(start_datetime, 'Schedules cannot be created in the past.')

        created_schedules = self._create_split_schedules(
            tutor=serializer.validated_data['tutor'],
            student=serializer.validated_data['student'],
            subject_topic=serializer.validated_data['subject_topic'],
            description=serializer.validated_data.get('description') or '',
            start_datetime=start_datetime,
            end_datetime=end_datetime,
            status=serializer.validated_data.get('status', Schedule.STATUS_UPCOMING),
        )

        response_payload = self.get_serializer(created_schedules[0]).data
        response_payload['created_count'] = len(created_schedules)
        return Response(response_payload, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()

        if is_tutor(request.user):
            if not partial:
                raise ValidationError({'detail': 'Tutors can only submit partial updates for rescheduling.'})

            if instance.status not in self.TUTOR_RESCHEDULABLE_STATUS:
                raise ValidationError({'detail': 'Only upcoming or pending schedules can be rescheduled.'})

            payload_keys = set(request.data.keys())
            invalid_fields = payload_keys - {'start_datetime', 'end_datetime', 'description'}
            if invalid_fields:
                raise ValidationError({'detail': 'Tutors can only edit start_datetime, end_datetime, and description.'})

            if 'start_datetime' not in request.data or 'end_datetime' not in request.data:
                raise ValidationError({'detail': 'start_datetime and end_datetime are required for tutor rescheduling.'})

            request_description = str(request.data.get('description') or '').strip()
            if not request_description:
                raise ValidationError({'description': 'Description is required for tutor requests.'})

            serializer = self.get_serializer(instance, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            next_start_datetime = serializer.validated_data['start_datetime']
            next_end_datetime = serializer.validated_data['end_datetime']

            if (
                next_start_datetime == instance.start_datetime
                and next_end_datetime == instance.end_datetime
            ):
                raise ValidationError({'start_datetime': 'The new schedule window must be different from the old one.'})

            self._validate_not_past(next_start_datetime, 'Tutors cannot reschedule to the past.')

            pending_change_exists = Request.objects.filter(
                old_schedule=instance,
                status=Request.STATUS_PENDING,
                request_type__in={Request.TYPE_EXTENSION, Request.TYPE_RESCHEDULE},
            ).exists()
            if pending_change_exists:
                raise ValidationError({'detail': 'A pending schedule change request already exists for this schedule.'})

            same_start_datetime = next_start_datetime == instance.start_datetime
            if same_start_datetime:
                new_schedules = self._create_extension_request_schedules(instance, next_end_datetime)
                request_obj = self._create_request(
                    old_schedule=instance,
                    new_schedules=new_schedules,
                    request_type=Request.TYPE_EXTENSION,
                    description=request_description,
                    extension=int(self.SESSION_DURATION.total_seconds() // 3600),
                )
                if instance.status != Schedule.STATUS_PENDING:
                    instance.status = Schedule.STATUS_PENDING
                    instance.save(update_fields=['status'])

                response_payload = self.get_serializer(new_schedules[0]).data
                response_payload['request_id'] = request_obj.id
                response_payload['request_count'] = len(new_schedules)
                return Response(response_payload, status=status.HTTP_201_CREATED)

            self._validate_schedule_window(next_start_datetime, next_end_datetime)
            new_schedules = self._create_split_schedules(
                tutor=instance.tutor,
                student=instance.student,
                subject_topic=instance.subject_topic,
                description=instance.description,
                start_datetime=next_start_datetime,
                end_datetime=next_end_datetime,
                status=Schedule.STATUS_PENDING,
            )
            request_obj = self._create_request(
                old_schedule=instance,
                new_schedules=new_schedules,
                request_type=Request.TYPE_RESCHEDULE,
                description=request_description,
            )
            if instance.status != Schedule.STATUS_PENDING:
                instance.status = Schedule.STATUS_PENDING
                instance.save(update_fields=['status'])

            response_payload = self.get_serializer(new_schedules[0]).data
            response_payload['request_id'] = request_obj.id
            response_payload['request_count'] = len(new_schedules)
            return Response(response_payload, status=status.HTTP_201_CREATED)

        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)

        next_start_datetime = serializer.validated_data.get('start_datetime', instance.start_datetime)
        next_end_datetime = serializer.validated_data.get('end_datetime', instance.end_datetime)
        if (
            next_start_datetime != instance.start_datetime
            or next_end_datetime != instance.end_datetime
        ):
            self._validate_not_past(next_start_datetime, 'Admins cannot reschedule to the past.')

            same_start_datetime = next_start_datetime == instance.start_datetime
            if same_start_datetime:
                if next_end_datetime <= instance.end_datetime:
                    raise ValidationError(
                        {'end_datetime': 'End datetime must be later than the current end datetime when extending.'}
                    )

                created_schedules = self._create_extension_request_schedules(instance, next_end_datetime)
                for created_schedule in created_schedules:
                    if created_schedule.status != Schedule.STATUS_UPCOMING:
                        created_schedule.status = Schedule.STATUS_UPCOMING
                        created_schedule.save(update_fields=['status'])

                response_payload = self.get_serializer(created_schedules[0]).data
                response_payload['created_count'] = len(created_schedules)
                return Response(response_payload, status=status.HTTP_200_OK)

            self._validate_schedule_window(next_start_datetime, next_end_datetime)
            created_schedules = self._create_split_schedules(
                tutor=instance.tutor,
                student=instance.student,
                subject_topic=instance.subject_topic,
                description=instance.description,
                start_datetime=next_start_datetime,
                end_datetime=next_end_datetime,
                status=Schedule.STATUS_UPCOMING,
            )
            instance.status = Schedule.STATUS_RESCHEDULED
            instance.save(update_fields=['status'])
            response_payload = self.get_serializer(created_schedules[0]).data
            response_payload['created_count'] = len(created_schedules)
            return Response(response_payload, status=status.HTTP_200_OK)

        self.perform_update(serializer)
        return Response(serializer.data)

    @extend_schema(
        request=TutorScheduleRequestPayloadSerializer,
        responses={
            201: TutorScheduleRequestResponseSerializer,
            400: MessageSerializer,
            403: MessageSerializer,
        },
    )
    @action(detail=False, methods=['post'], url_path='request')
    def request_schedule(self, request):
        if not is_tutor(request.user):
            return Response({'detail': 'Only tutors can request schedules.'}, status=status.HTTP_403_FORBIDDEN)

        request_serializer = TutorScheduleRequestPayloadSerializer(data=request.data)
        request_serializer.is_valid(raise_exception=True)

        start_datetime = request_serializer.validated_data['start_datetime']
        end_datetime = request_serializer.validated_data['end_datetime']
        self._validate_schedule_window(start_datetime, end_datetime)
        self._validate_not_past(start_datetime, 'Tutors cannot request schedules in the past.')

        try:
            student = Student.objects.get(id=request_serializer.validated_data['student'])
        except Student.DoesNotExist as exc:
            raise ValidationError({'student': 'Student with this id does not exist.'}) from exc

        overlap_exists = Schedule.objects.filter(
            tutor=request.user,
            student=student,
            start_datetime__lt=end_datetime,
            end_datetime__gt=start_datetime,
            status__in={Schedule.STATUS_UPCOMING, Schedule.STATUS_PENDING},
        ).exists()
        if overlap_exists:
            raise ValidationError({'detail': 'You already have an overlapping active/pending schedule for this student.'})

        created_schedules = self._create_split_schedules(
            tutor=request.user,
            student=student,
            subject_topic=request_serializer.validated_data['subject_topic'],
            description=request_serializer.validated_data['description'],
            start_datetime=start_datetime,
            end_datetime=end_datetime,
            status=Schedule.STATUS_PENDING,
        )
        request_obj = self._create_request(
            old_schedule=None,
            new_schedules=created_schedules,
            request_type=Request.TYPE_NEW_SCHEDULE,
            description=request_serializer.validated_data['description'],
        )

        return Response(
            {
                'request_id': request_obj.id,
                'request_count': len(created_schedules),
                'schedule': self.get_serializer(created_schedules[0]).data,
            },
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(
        request=TutorCancelRequestPayloadSerializer,
        responses={
            201: inline_serializer(
                name='TutorCancelRequestResponse',
                fields={
                    'request_id': serializers.IntegerField(),
                    'schedule_id': serializers.IntegerField(),
                },
            ),
            400: MessageSerializer,
            403: MessageSerializer,
        },
    )
    @action(detail=True, methods=['post'], url_path='request-cancel')
    def request_cancel(self, request, pk=None):
        if not is_tutor(request.user):
            return Response({'detail': 'Only tutors can request cancellations.'}, status=status.HTTP_403_FORBIDDEN)

        schedule = self.get_object()
        if schedule.tutor_id != request.user.id:
            return Response({'detail': 'Tutors can only request cancellation for their own schedules.'}, status=status.HTTP_403_FORBIDDEN)

        if schedule.status not in {Schedule.STATUS_UPCOMING, Schedule.STATUS_PENDING}:
            raise ValidationError({'detail': 'Only upcoming or pending schedules can be cancelled.'})

        cancel_serializer = TutorCancelRequestPayloadSerializer(data=request.data)
        cancel_serializer.is_valid(raise_exception=True)

        pending_cancel_exists = Request.objects.filter(
            old_schedule=schedule,
            request_type=Request.TYPE_CANCEL,
            status=Request.STATUS_PENDING,
        ).exists()
        if pending_cancel_exists:
            raise ValidationError({'detail': 'A pending cancellation request already exists for this schedule.'})

        request_obj = self._create_request(
            old_schedule=schedule,
            new_schedules=[],
            request_type=Request.TYPE_CANCEL,
            description=cancel_serializer.validated_data['description'],
        )

        if schedule.status != Schedule.STATUS_PENDING:
            schedule.status = Schedule.STATUS_PENDING
            schedule.save(update_fields=['status'])

        return Response(
            {
                'request_id': request_obj.id,
                'schedule_id': schedule.id,
            },
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(
        request=inline_serializer(
            name='GenerateMonthlyReportRequest',
            fields={
                'month': serializers.CharField(help_text='Target month in YYYY-MM format.', required=True),
            },
        ),
        responses={
            200: inline_serializer(
                name='GenerateMonthlyReportResponse',
                fields={
                    'detail': serializers.CharField(),
                    'sheet_url': serializers.CharField(),
                    'sheet_id': serializers.CharField(),
                    'month': serializers.CharField(),
                },
            ),
            400: MessageSerializer,
            502: MessageSerializer,
        },
        examples=[
            OpenApiExample(
                name='Generate monthly report request',
                value={'month': '2026-03'},
                request_only=True,
            ),
            OpenApiExample(
                name='Generate monthly report response',
                value={
                    'detail': 'Monthly report generated successfully.',
                    'sheet_url': 'https://docs.google.com/spreadsheets/d/your-sheet-id/edit',
                    'sheet_id': 'your-sheet-id',
                    'month': '2026-03',
                },
                response_only=True,
            ),
        ],
    )
    @action(detail=False, methods=['post'], url_path='generate-monthly-report')
    def generate_monthly_report(self, request):
        if not is_admin(request.user):
            return Response({'detail': 'You do not have permission to perform this action.'}, status=status.HTTP_403_FORBIDDEN)

        month_value = str(request.data.get('month') or '').strip()
        try:
            target_month = datetime.strptime(month_value, '%Y-%m')
        except ValueError:
            return Response({'detail': 'Invalid month format. Use YYYY-MM.'}, status=status.HTTP_400_BAD_REQUEST)

        month_start = timezone.make_aware(datetime(target_month.year, target_month.month, 1), timezone.get_current_timezone())
        if target_month.month == 12:
            next_month_start = timezone.make_aware(datetime(target_month.year + 1, 1, 1), timezone.get_current_timezone())
        else:
            next_month_start = timezone.make_aware(datetime(target_month.year, target_month.month + 1, 1), timezone.get_current_timezone())

        schedules = (
            Schedule.objects.select_related('tutor', 'student', 'check_in', 'check_in__check_out')
            .filter(start_datetime__gte=month_start, start_datetime__lt=next_month_start)
            .order_by('start_datetime', 'id')
        )

        student_name_map = {}
        for student in Student.objects.filter(id__in=schedules.values_list('student', flat=True)).only('id', 'first_name', 'last_name'):
            display_name = f"{(student.first_name or '').strip()} {(student.last_name or '').strip()}".strip()
            student_name_map[student.id] = display_name or f'#{student.id}'

        csv_buffer = io.StringIO()
        writer = csv.writer(csv_buffer)
        writer.writerow([
            'Schedule ID',
            'Start Datetime',
            'End Datetime',
            'Tutor',
            'Student Name',
            'Subject Topic',
            'Schedule Description',
            'Status',
            'Check In Time',
            'Check In Location',
            'Check In Description',
            'Check In Photo',
            'Check Out Time',
            'Check Out Photo',
            'Total Shift Time',
        ])

        for schedule in schedules:
            check_in = getattr(schedule, 'check_in', None)
            check_out = getattr(check_in, 'check_out', None) if check_in else None
            tutor_full_name = f"{(schedule.tutor.first_name or '').strip()} {(schedule.tutor.last_name or '').strip()}".strip()
            tutor_name = tutor_full_name or schedule.tutor.username

            writer.writerow([
                schedule.id,
                timezone.localtime(schedule.start_datetime).strftime('%Y-%m-%d %H:%M:%S'),
                timezone.localtime(schedule.end_datetime).strftime('%Y-%m-%d %H:%M:%S'),
                tutor_name,
                student_name_map.get(schedule.student.id, ''),
                schedule.subject_topic,
                schedule.description,
                schedule.status,
                timezone.localtime(check_in.check_in_time).strftime('%Y-%m-%d %H:%M:%S') if check_in and check_in.check_in_time else '',
                self._to_hyperlink_formula(
                    build_location_search_url(check_in.check_in_location) if check_in else '',
                    'Open Location',
                ),
                check_in.description if check_in else '',
                self._to_hyperlink_formula(
                    check_in.check_in_photo if check_in and check_in.check_in_photo else '',
                    'View Check In Photo',
                ),
                timezone.localtime(check_out.check_out_time).strftime('%Y-%m-%d %H:%M:%S') if check_out and check_out.check_out_time else '',
                self._to_hyperlink_formula(
                    check_out.check_out_photo if check_out and check_out.check_out_photo else '',
                    'View Check Out Photo',
                ),
                str(check_out.total_shift_time) if check_out and check_out.total_shift_time else '',
            ])

        generated_at = timezone.now()
        report_name = report_file_name(
            target_month=target_month.date(),
            generated_at=generated_at,
        )

        try:
            uploader = GoogleDriveUploader()
            csv_file = SimpleUploadedFile(
                name=f'{report_name}.csv',
                content=csv_buffer.getvalue().encode('utf-8'),
                content_type='text/csv',
            )
            report_sheet = uploader.upload_file(
                file_obj=csv_file,
                folder_parts=report_folder_parts(target_month.date()),
                file_name=report_name,
                target_mime_type='application/vnd.google-apps.spreadsheet',
                return_metadata=True,
            )
            uploader.format_monthly_report_sheet(
                spreadsheet_id=report_sheet['id'],
                sheet_title=target_month.strftime('%m-%Y'),
                status_values=[status_value for status_value, _ in Schedule.STATUS_CHOICES],
            )
        except GoogleDriveUploadError as exc:
            return Response(
                {'detail': f'Failed to upload monthly report to Google Drive: {exc}'},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response(
            {
                'detail': 'Monthly report generated successfully.',
                'sheet_url': report_sheet['url'],
                'sheet_id': report_sheet['id'],
                'month': target_month.strftime('%Y-%m'),
            },
            status=status.HTTP_200_OK,
        )

    @extend_schema(
        request=None,
        responses={
            200: EmailBlastPermissionSerializer,
            403: MessageSerializer,
        },
    )
    @action(detail=False, methods=['get'], url_path='email-blast-permission')
    def email_blast_permission(self, request):
        if not is_admin(request.user):
            return Response({'detail': 'You do not have permission to perform this action.'}, status=status.HTTP_403_FORBIDDEN)

        permission = get_admin_blast_permission_state(admin_user=request.user)
        return Response(
            {
                'can_daily': permission.can_daily,
                'can_weekly': permission.can_weekly,
            },
            status=status.HTTP_200_OK,
        )

    @extend_schema(
        request=EmailBlastPayloadSerializer,
        responses={
            200: EmailBlastResponseSerializer,
            400: MessageSerializer,
            403: MessageSerializer,
            502: MessageSerializer,
        },
        examples=[
            OpenApiExample(
                name='Daily blast request',
                value={'mode': 'daily'},
                request_only=True,
            ),
            OpenApiExample(
                name='Weekly blast response',
                value={
                    'detail': 'Weekly blast processed.',
                    'mode': 'weekly',
                    'period_start': '2026-03-23',
                    'period_end': '2026-03-29',
                    'sent_count': 15,
                    'failed_count': 2,
                    'permission': {
                        'can_daily': False,
                        'can_weekly': False,
                    },
                },
                response_only=True,
            ),
        ],
    )
    @action(detail=False, methods=['post'], url_path='email-blast')
    def email_blast(self, request):
        if not is_admin(request.user):
            return Response({'detail': 'You do not have permission to perform this action.'}, status=status.HTTP_403_FORBIDDEN)

        serializer = EmailBlastPayloadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        mode = serializer.validated_data['mode']
        try:
            result = send_admin_schedule_blast(admin_user=request.user, mode=mode)
        except PermissionError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except GoogleDriveUploadError as exc:
            return Response({'detail': f'Failed to write audit logs to Google Drive: {exc}'}, status=status.HTTP_502_BAD_GATEWAY)

        return Response(
            {
                'detail': f'{mode.capitalize()} blast processed.',
                'mode': result['mode'],
                'period_start': result['period_start'],
                'period_end': result['period_end'],
                'sent_count': result['sent_count'],
                'failed_count': result['failed_count'],
                'permission': {
                    'can_daily': result['permission'].can_daily,
                    'can_weekly': result['permission'].can_weekly,
                },
            },
            status=status.HTTP_200_OK,
        )
