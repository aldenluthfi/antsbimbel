from django.db.models import Q
from drf_spectacular.utils import extend_schema
from rest_framework.permissions import IsAuthenticated
from rest_framework import viewsets

from .api_parameters import USER_LIST_QUERY_PARAMETERS
from .models import Schedule, Student
from .pagination import StandardResultsSetPagination
from .permissions import StudentPermission, is_admin, is_tutor
from .student_serializers import StudentSerializer


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
