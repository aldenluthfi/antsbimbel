from django.contrib.auth import authenticate, get_user_model, logout
from django.utils.dateparse import parse_date, parse_datetime
from drf_spectacular.utils import OpenApiParameter, OpenApiTypes, extend_schema
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework import mixins, status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import CheckIn, Schedule, Student
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
		name='tutor_id',
		description='Filter by tutor user id.',
		required=False,
		type=OpenApiTypes.INT,
		location=OpenApiParameter.QUERY,
	),
	OpenApiParameter(
		name='student_id',
		description='Filter by student id.',
		required=False,
		type=OpenApiTypes.STR,
		location=OpenApiParameter.QUERY,
	),
	OpenApiParameter(
		name='start_date',
		description='Start of date range. Use YYYY-MM-DD or ISO datetime.',
		required=False,
		type=OpenApiTypes.STR,
		location=OpenApiParameter.QUERY,
	),
	OpenApiParameter(
		name='end_date',
		description='End of date range. Use YYYY-MM-DD or ISO datetime.',
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

USER_LIST_QUERY_PARAMETERS = [
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
		return super().get_queryset().filter(is_staff=False, is_superuser=False)

	@extend_schema(parameters=USER_LIST_QUERY_PARAMETERS)
	def list(self, request, *args, **kwargs):
		return super().list(request, *args, **kwargs)


class StudentViewSet(viewsets.ModelViewSet):
	queryset = Student.objects.all().order_by('student_id')
	serializer_class = StudentSerializer
	permission_classes = [IsAuthenticated, StudentPermission]
	pagination_class = StandardResultsSetPagination

	def get_queryset(self):
		queryset = super().get_queryset()
		user = self.request.user

		if is_admin(user):
			return queryset

		if is_tutor(user):
			scheduled_student_ids = Schedule.objects.filter(tutor=user).values_list('student_id', flat=True)
			return queryset.filter(student_id__in=scheduled_student_ids)

		return queryset.none()

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

		tutor_id = self.request.query_params.get('tutor_id')
		student_id = self.request.query_params.get('student_id')
		start_date_param = self.request.query_params.get('start_date')
		end_date_param = self.request.query_params.get('end_date')

		if tutor_id:
			queryset = queryset.filter(tutor_id=tutor_id)

		if student_id:
			queryset = queryset.filter(student_id=student_id)

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

	@extend_schema(parameters=LIST_QUERY_PARAMETERS)
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

	def get_queryset(self):
		queryset = super().get_queryset()
		user = self.request.user

		if not is_admin(user) and not is_tutor(user):
			return queryset.none()

		if is_tutor(user):
			queryset = queryset.filter(tutor=user)

		tutor_id = self.request.query_params.get('tutor_id')
		student_id = self.request.query_params.get('student_id')
		start_date_param = self.request.query_params.get('start_date')
		end_date_param = self.request.query_params.get('end_date')
		status_param = self.request.query_params.get('status')

		if tutor_id:
			queryset = queryset.filter(tutor_id=tutor_id)

		if student_id:
			queryset = queryset.filter(student_id=student_id)

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
