import csv
import io
from datetime import datetime, timedelta

from django.contrib.auth import authenticate, get_user_model, logout
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db.models import Q
from django.http import HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from drf_spectacular.utils import OpenApiExample, OpenApiParameter, OpenApiResponse, OpenApiTypes, extend_schema, inline_serializer
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.decorators import action
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from .google_drive import GoogleDriveUploadError, GoogleDriveUploader
from .models import CheckIn, Schedule, Student
from .location_utils import build_location_search_url
from .permissions import (
	AttendancePermission,
	IsAdminForUserManagement,
	SchedulePermission,
	StudentPermission,
	is_admin,
	is_tutor,
)
from .serializers import (
	CheckInSerializer,
	LoginResponseSerializer,
	LoginSerializer,
	MessageSerializer,
	ScheduleSerializer,
	StudentSerializer,
	UserSerializer,
)


User = get_user_model()

LIST_QUERY_PARAMETERS = [
	OpenApiParameter(
		name='tutor',
		description='Filter by tutor user id.',
		required=False,
		type=OpenApiTypes.INT,
		location=OpenApiParameter.QUERY,
	),
	OpenApiParameter(
		name='student',
		description='Filter by student primary key id.',
		required=False,
		type=OpenApiTypes.INT,
		location=OpenApiParameter.QUERY,
	),
	OpenApiParameter(
		name='start_date',
		description='Start of date range. Use YYYY-MM-DD.',
		required=False,
		type=OpenApiTypes.STR,
		location=OpenApiParameter.QUERY,
	),
	OpenApiParameter(
		name='end_date',
		description='End of date range. Use YYYY-MM-DD.',
		required=False,
		type=OpenApiTypes.STR,
		location=OpenApiParameter.QUERY,
	),
	OpenApiParameter(
		name='status',
		description='Filter by schedule status. Allowed: upcoming, done, cancelled, rescheduled.',
		required=False,
		type=OpenApiTypes.STR,
		location=OpenApiParameter.QUERY,
	),
	OpenApiParameter(
		name='sort_by',
		description='Schedule sort field. Allowed: id, scheduled_at, status.',
		required=False,
		type=OpenApiTypes.STR,
		location=OpenApiParameter.QUERY,
	),
	OpenApiParameter(
		name='sort_order',
		description='Sort direction. Allowed: asc, desc. Defaults to desc.',
		required=False,
		type=OpenApiTypes.STR,
		location=OpenApiParameter.QUERY,
	),
]

LIST_PAGINATION_QUERY_PARAMETERS = [
	OpenApiParameter(
		name='page',
		description='Page number.',
		required=False,
		type=OpenApiTypes.INT,
		location=OpenApiParameter.QUERY,
	),
	OpenApiParameter(
		name='page_size',
		description='Results per page (max 100).',
		required=False,
		type=OpenApiTypes.INT,
		location=OpenApiParameter.QUERY,
	),
]

SCHEDULE_LIST_QUERY_PARAMETERS = [*LIST_QUERY_PARAMETERS, *LIST_PAGINATION_QUERY_PARAMETERS]

CALENDAR_PAGINATION_QUERY_PARAMETERS = [
	*LIST_QUERY_PARAMETERS,
	OpenApiParameter(
		name='mode',
		description='Calendar mode. Allowed: month, week. Defaults to month.',
		required=False,
		type=OpenApiTypes.STR,
		location=OpenApiParameter.QUERY,
	),
	OpenApiParameter(
		name='cursor_date',
		description='Reference date in YYYY-MM-DD. Defaults to today.',
		required=False,
		type=OpenApiTypes.STR,
		location=OpenApiParameter.QUERY,
	),
]

USER_LIST_QUERY_PARAMETERS = [
	OpenApiParameter(
		name='search',
		description='Case-insensitive search text for list results.',
		required=False,
		type=OpenApiTypes.STR,
		location=OpenApiParameter.QUERY,
	),
	OpenApiParameter(
		name='page',
		description='Page number.',
		required=False,
		type=OpenApiTypes.INT,
		location=OpenApiParameter.QUERY,
	),
	OpenApiParameter(
		name='page_size',
		description='Results per page (max 100).',
		required=False,
		type=OpenApiTypes.INT,
		location=OpenApiParameter.QUERY,
	),
]


class StandardResultsSetPagination(PageNumberPagination):
	page_size = 10
	page_size_query_param = 'page_size'
	max_page_size = 100


class LoginView(APIView):
	permission_classes = [AllowAny]

	@extend_schema(
		request=LoginSerializer,
		responses={200: LoginResponseSerializer, 400: MessageSerializer, 401: MessageSerializer, 403: MessageSerializer},
	)

	def post(self, request):
		username = request.data.get('username')
		password = request.data.get('password')

		if not username or not password:
			return Response(
				{'detail': 'username and password are required.'},
				status=status.HTTP_400_BAD_REQUEST,
			)

		user = authenticate(request=request, username=username, password=password)
		if not user:
			return Response({'detail': 'Invalid credentials.'}, status=status.HTTP_401_UNAUTHORIZED)

		if not user.is_active:
			return Response({'detail': 'User account is inactive.'}, status=status.HTTP_403_FORBIDDEN)

		Token.objects.filter(user=user).delete()
		token = Token.objects.create(user=user)

		return Response(
			{
				'token': token.key,
				'user': UserSerializer(user).data,
			},
			status=status.HTTP_200_OK,
		)


class LogoutView(APIView):
	permission_classes = [IsAuthenticated]

	@extend_schema(request=None, responses={200: MessageSerializer})

	def post(self, request):
		Token.objects.filter(user=request.user).delete()
		logout(request)
		return Response({'detail': 'Successfully logged out.'}, status=status.HTTP_200_OK)


class UserViewSet(viewsets.ModelViewSet):
	queryset = User.objects.all().order_by('id')
	serializer_class = UserSerializer
	permission_classes = [IsAuthenticated, IsAdminForUserManagement]
	pagination_class = StandardResultsSetPagination

	def get_queryset(self):
		# User management is intended for tutor accounts only.
		queryset = super().get_queryset().filter(is_staff=False, is_superuser=False)
		search_value = str(self.request.query_params.get('search') or '').strip()

		if search_value:
			queryset = queryset.filter(
				Q(username__icontains=search_value)
				| Q(first_name__icontains=search_value)
				| Q(last_name__icontains=search_value)
				| Q(email__icontains=search_value)
			)

		return queryset

	@extend_schema(parameters=USER_LIST_QUERY_PARAMETERS)
	def list(self, request, *args, **kwargs):
		return super().list(request, *args, **kwargs)


class StudentViewSet(viewsets.ModelViewSet):
	queryset = Student.objects.all().order_by('id')
	serializer_class = StudentSerializer
	permission_classes = [IsAuthenticated, StudentPermission]
	pagination_class = StandardResultsSetPagination

	def get_queryset(self):
		queryset = super().get_queryset()
		user = self.request.user

		if is_tutor(user):
			scheduled_students = Schedule.objects.filter(tutor=user).values_list('student', flat=True)
			queryset = queryset.filter(id__in=scheduled_students)
		elif not is_admin(user):
			return queryset.none()

		search_value = str(self.request.query_params.get('search') or '').strip()
		if search_value:
			search_filters = Q(first_name__icontains=search_value) | Q(last_name__icontains=search_value)
			if search_value.isdigit():
				search_filters |= Q(id=int(search_value))
			queryset = queryset.filter(search_filters)

		return queryset

	@extend_schema(parameters=USER_LIST_QUERY_PARAMETERS)
	def list(self, request, *args, **kwargs):
		return super().list(request, *args, **kwargs)


class AttendanceViewSet(
	mixins.CreateModelMixin,
	mixins.RetrieveModelMixin,
	mixins.UpdateModelMixin,
	mixins.DestroyModelMixin,
	viewsets.GenericViewSet,
):
	queryset = CheckIn.objects.select_related('tutor', 'check_out').all().order_by('-check_in_time')
	serializer_class = CheckInSerializer
	permission_classes = [IsAuthenticated, AttendancePermission]
	pagination_class = StandardResultsSetPagination

	def get_queryset(self):
		queryset = super().get_queryset()
		user = self.request.user

		if is_admin(user):
			return queryset

		if is_tutor(user):
			queryset = queryset.filter(tutor=user)

		elif not is_admin(user):
			return queryset.none()

		tutor = self.request.query_params.get('tutor')
		student = self.request.query_params.get('student')
		start_date_param = self.request.query_params.get('start_date')
		end_date_param = self.request.query_params.get('end_date')

		if tutor:
			queryset = queryset.filter(tutor=tutor)

		if student:
			queryset = queryset.filter(student=student)

		if start_date_param:
			start_dt = parse_datetime(start_date_param)
			if start_dt:
				queryset = queryset.filter(check_in_time__gte=start_dt)
			else:
				start_date = parse_date(start_date_param)
				if not start_date:
					raise ValidationError({'start_date': 'Invalid date format. Use YYYY-MM-DD or ISO datetime.'})
				queryset = queryset.filter(check_in_time__date__gte=start_date)

		if end_date_param:
			end_dt = parse_datetime(end_date_param)
			if end_dt:
				queryset = queryset.filter(check_in_time__lte=end_dt)
			else:
				end_date = parse_date(end_date_param)
				if not end_date:
					raise ValidationError({'end_date': 'Invalid date format. Use YYYY-MM-DD or ISO datetime.'})
				queryset = queryset.filter(check_in_time__date__lte=end_date)

		return queryset

	@extend_schema(
		request=None,
		responses={
			200: OpenApiResponse(response=OpenApiTypes.BINARY, description='Attendance photo file stream.'),
			404: MessageSerializer,
			502: MessageSerializer,
		},
	)
	@action(detail=True, methods=['get'], url_path=r'photo/(?P<photo_kind>check-in|check-out)')
	def photo(self, request, pk=None, photo_kind=None):
		check_in = self.get_object()

		if photo_kind == 'check-in':
			stored_photo = check_in.check_in_photo
		else:
			check_out = getattr(check_in, 'check_out', None)
			if not check_out or not check_out.check_out_photo:
				return Response({'detail': 'Photo not found.'}, status=status.HTTP_404_NOT_FOUND)
			stored_photo = check_out.check_out_photo

		file_id = self._extract_google_drive_file_id(stored_photo)
		if not file_id:
			return Response({'detail': 'Unsupported photo source.'}, status=status.HTTP_404_NOT_FOUND)

		try:
			uploader = GoogleDriveUploader()
			file_data = uploader.download_file(file_id=file_id)
		except GoogleDriveUploadError as exc:
			return Response(
				{'detail': f'Failed to fetch image from Google Drive: {exc}'},
				status=status.HTTP_502_BAD_GATEWAY,
			)

		response = HttpResponse(
			file_data['content'],
			content_type=file_data['mime_type'],
		)
		response['Content-Disposition'] = f'inline; filename="{file_data["name"]}"'
		response['Cache-Control'] = 'private, max-age=300'
		return response

	@staticmethod
	def _extract_google_drive_file_id(value):
		normalized = str(value or '').strip()
		if not normalized:
			return None

		import re

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


class ScheduleViewSet(viewsets.ModelViewSet):
	queryset = Schedule.objects.select_related('tutor', 'check_in', 'check_in__check_out').all().order_by('-scheduled_at')
	serializer_class = ScheduleSerializer
	permission_classes = [IsAuthenticated, SchedulePermission]
	pagination_class = StandardResultsSetPagination
	ALLOWED_SCHEDULE_STATUS = {
		Schedule.STATUS_UPCOMING,
		Schedule.STATUS_DONE,
		Schedule.STATUS_CANCELLED,
		Schedule.STATUS_RESCHEDULED,
	}

	@extend_schema(parameters=SCHEDULE_LIST_QUERY_PARAMETERS)
	def list(self, request, *args, **kwargs):
		queryset = self.filter_queryset(self.get_queryset())
		sort_by = request.query_params.get('sort_by', 'scheduled_at').strip().lower()
		sort_order = request.query_params.get('sort_order', '').strip().lower()

		if sort_by not in {'id', 'scheduled_at', 'status'}:
			raise ValidationError({'sort_by': 'Invalid sort field. Allowed values are id, scheduled_at, status.'})

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
		sort_by = request.query_params.get('sort_by', 'scheduled_at').strip().lower()
		sort_order = request.query_params.get('sort_order', '').strip().lower()
		mode = request.query_params.get('mode', 'month').strip().lower()
		cursor_date_param = request.query_params.get('cursor_date', '').strip()

		if sort_by not in {'id', 'scheduled_at', 'status'}:
			raise ValidationError({'sort_by': 'Invalid sort field. Allowed values are id, scheduled_at, status.'})

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
			start_offset = cursor_date.weekday() + 1 if cursor_date.weekday() < 6 else 0
			period_start = cursor_date - timedelta(days=start_offset)
			period_end = period_start + timedelta(days=6)
			previous_cursor_date = period_start - timedelta(days=7)
			next_cursor_date = period_start + timedelta(days=7)

		order_by_field = sort_by if sort_order == 'asc' else f'-{sort_by}'
		period_queryset = queryset.filter(
			scheduled_at__date__gte=period_start,
			scheduled_at__date__lte=period_end,
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
			queryset = queryset.filter(scheduled_at__date__gte=start_date)

		if end_date_param:
			end_date = parse_date(end_date_param)
			if not end_date:
				raise ValidationError({'end_date': 'Invalid date format. Use YYYY-MM-DD or ISO datetime.'})
			queryset = queryset.filter(scheduled_at__date__lte=end_date)

		if status_param:
			status_value = status_param.strip().lower()
			if status_value not in self.ALLOWED_SCHEDULE_STATUS:
				raise ValidationError(
					{'status': 'Invalid status. Allowed values are upcoming, done, cancelled, rescheduled.'}
				)
			queryset = queryset.filter(status=status_value)

		return queryset

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
			.filter(scheduled_at__gte=month_start, scheduled_at__lt=next_month_start)
			.order_by('scheduled_at', 'id')
		)

		student_name_map = {}
		for student in Student.objects.filter(id__in=schedules.values_list('student', flat=True)).only('id', 'first_name', 'last_name'):
			display_name = f"{(student.first_name or '').strip()} {(student.last_name or '').strip()}".strip()
			student_name_map[student.id] = display_name or f'#{student.id}'

		csv_buffer = io.StringIO()
		writer = csv.writer(csv_buffer)
		writer.writerow([
			'Schedule ID',
			'Scheduled At',
			'Tutor',
			'Student ID',
			'Student Name',
			'Subject Topic',
			'Status',
			'Check In Time',
			'Check In Location Link',
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
				timezone.localtime(schedule.scheduled_at).strftime('%Y-%m-%d %H:%M:%S'),
				tutor_name,
				schedule.student.id,
				student_name_map.get(schedule.student.id, ''),
				schedule.subject_topic,
				schedule.status,
				timezone.localtime(check_in.check_in_time).strftime('%Y-%m-%d %H:%M:%S') if check_in and check_in.check_in_time else '',
				build_location_search_url(check_in.check_in_location) if check_in else '',
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
