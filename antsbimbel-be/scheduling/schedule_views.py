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
from .google_drive import GoogleDriveUploadError, GoogleDriveUploader
from .location_utils import build_location_search_url
from .models import Request, Schedule, Student
from .pagination import StandardResultsSetPagination
from .permissions import SchedulePermission, is_admin, is_tutor
from .schedule_serializers import ScheduleSerializer


class TutorScheduleRequestPayloadSerializer(serializers.Serializer):
    student = serializers.IntegerField(required=True)
    subject_topic = serializers.CharField(required=True)
    description = serializers.CharField(required=False, allow_blank=True, default='')
    start_datetime = serializers.DateTimeField(required=True)
    end_datetime = serializers.DateTimeField(required=True)


class ScheduleViewSet(viewsets.ModelViewSet):
    queryset = Schedule.objects.select_related('tutor', 'check_in', 'check_in__check_out').all().order_by('-start_datetime')
    serializer_class = ScheduleSerializer
    permission_classes = [IsAuthenticated, SchedulePermission]
    pagination_class = StandardResultsSetPagination
    ALLOWED_SCHEDULE_STATUS = {
        Schedule.STATUS_UPCOMING,
        Schedule.STATUS_DONE,
        Schedule.STATUS_MISSED,
        Schedule.STATUS_CANCELLED,
        Schedule.STATUS_RESCHEDULED,
        Schedule.STATUS_PENDING,
        Schedule.STATUS_REJECTED,
    }
    MINIMUM_SCHEDULE_DURATION = timedelta(hours=2)

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

        if end_datetime - start_datetime < ScheduleViewSet.MINIMUM_SCHEDULE_DURATION:
            raise ValidationError({'end_datetime': 'Schedule duration must be at least 2 hours.'})

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
    def _create_request(old_schedule, new_schedule):
        return Request.objects.create(old_schedule=old_schedule, new_schedule=new_schedule)

    @staticmethod
    def _local_day_start(day_value):
        return timezone.make_aware(
            datetime.combine(day_value, datetime.min.time()),
            timezone.get_current_timezone(),
        )

    @classmethod
    def _local_date_range_kwargs(cls, start_date, end_date):
        return {
            'start_datetime__gte': cls._local_day_start(start_date),
            'start_datetime__lt': cls._local_day_start(end_date + timedelta(days=1)),
        }

    @staticmethod
    def _mark_overdue_upcoming_as_missed():
        overdue_cutoff = timezone.now() - timedelta(minutes=15)
        Schedule.objects.filter(
            status=Schedule.STATUS_UPCOMING,
            end_datetime__lt=overdue_cutoff,
            check_in__isnull=True,
        ).update(status=Schedule.STATUS_MISSED)

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
        status_param = self.request.query_params.get('status')

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

        if status_param:
            status_value = status_param.strip().lower()
            if status_value not in self.ALLOWED_SCHEDULE_STATUS:
                raise ValidationError(
                    {'status': 'Invalid status. Allowed values are upcoming, done, missed, cancelled, rescheduled, pending, rejected.'}
                )
            queryset = queryset.filter(status=status_value)

        return queryset

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self._validate_schedule_window(
            serializer.validated_data['start_datetime'],
            serializer.validated_data['end_datetime'],
        )
        self._validate_not_past(
            serializer.validated_data['start_datetime'],
            'Schedules cannot be created in the past.',
        )
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()

        if is_tutor(request.user):
            if not partial:
                raise ValidationError({'detail': 'Tutors can only submit partial updates for rescheduling.'})

            payload_keys = set(request.data.keys())
            invalid_fields = payload_keys - {'start_datetime', 'end_datetime'}
            if invalid_fields:
                raise ValidationError({'detail': 'Tutors can only edit start_datetime and end_datetime.'})

            if 'start_datetime' not in request.data or 'end_datetime' not in request.data:
                raise ValidationError({'detail': 'start_datetime and end_datetime are required for tutor rescheduling.'})

            serializer = self.get_serializer(instance, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            next_start_datetime = serializer.validated_data['start_datetime']
            next_end_datetime = serializer.validated_data['end_datetime']

            self._validate_schedule_window(next_start_datetime, next_end_datetime)

            if (
                next_start_datetime == instance.start_datetime
                and next_end_datetime == instance.end_datetime
            ):
                raise ValidationError({'start_datetime': 'The new schedule window must be different from the old one.'})

            self._validate_not_past(next_start_datetime, 'Tutors cannot reschedule to the past.')

            new_schedule = self._clone_schedule(
                instance,
                start_datetime=next_start_datetime,
                end_datetime=next_end_datetime,
                status=Schedule.STATUS_PENDING,
            )
            instance.status = Schedule.STATUS_PENDING
            instance.save(update_fields=['status'])

            request_obj = self._create_request(old_schedule=instance, new_schedule=new_schedule)
            response_payload = self.get_serializer(new_schedule).data
            response_payload['request_id'] = request_obj.id
            return Response(response_payload, status=status.HTTP_201_CREATED)

        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)

        next_start_datetime = serializer.validated_data.get('start_datetime', instance.start_datetime)
        next_end_datetime = serializer.validated_data.get('end_datetime', instance.end_datetime)
        self._validate_schedule_window(next_start_datetime, next_end_datetime)

        if (
            next_start_datetime != instance.start_datetime
            or next_end_datetime != instance.end_datetime
        ):
            self._validate_not_past(next_start_datetime, 'Admins cannot reschedule to the past.')

            new_schedule = self._clone_schedule(
                instance,
                start_datetime=next_start_datetime,
                end_datetime=next_end_datetime,
                status=Schedule.STATUS_UPCOMING,
            )
            instance.status = Schedule.STATUS_RESCHEDULED
            instance.save(update_fields=['status'])
            return Response(self.get_serializer(new_schedule).data, status=status.HTTP_200_OK)

        self.perform_update(serializer)
        return Response(serializer.data)

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

        new_schedule = Schedule.objects.create(
            tutor=request.user,
            student=student,
            subject_topic=request_serializer.validated_data['subject_topic'],
            description=request_serializer.validated_data.get('description') or '',
            start_datetime=start_datetime,
            end_datetime=end_datetime,
            status=Schedule.STATUS_PENDING,
        )
        request_obj = self._create_request(old_schedule=None, new_schedule=new_schedule)

        return Response(
            {
                'request_id': request_obj.id,
                'schedule': self.get_serializer(new_schedule).data,
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
            'Student ID',
            'Student Name',
            'Subject Topic',
            'Schedule Description',
            'Status',
            'Check In Time',
            'Check In Location Link',
            'Check In Description',
            'Check In Photo URL',
            'Check Out Time',
            'Check Out Photo URL',
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
                schedule.student.id,
                student_name_map.get(schedule.student.id, ''),
                schedule.subject_topic,
                schedule.description,
                schedule.status,
                timezone.localtime(check_in.check_in_time).strftime('%Y-%m-%d %H:%M:%S') if check_in and check_in.check_in_time else '',
                build_location_search_url(check_in.check_in_location) if check_in else '',
                check_in.description if check_in else '',
                check_in.check_in_photo if check_in and check_in.check_in_photo else '',
                timezone.localtime(check_out.check_out_time).strftime('%Y-%m-%d %H:%M:%S') if check_out and check_out.check_out_time else '',
                check_out.check_out_photo if check_out and check_out.check_out_photo else '',
                str(check_out.total_shift_time) if check_out and check_out.total_shift_time else '',
            ])

        report_title = f'Schedule Report {target_month.strftime("%Y-%m")}'
        report_month_folder = target_month.strftime('%m-%Y')

        try:
            uploader = GoogleDriveUploader()
            csv_file = SimpleUploadedFile(
                name=f'{report_title}.csv',
                content=csv_buffer.getvalue().encode('utf-8'),
                content_type='text/csv',
            )
            report_sheet = uploader.upload_file(
                file_obj=csv_file,
                folder_parts=[report_month_folder],
                file_name=report_title,
                target_mime_type='application/vnd.google-apps.spreadsheet',
                return_metadata=True,
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
