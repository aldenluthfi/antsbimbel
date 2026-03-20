from django.contrib.auth import get_user_model
from django.db.models import Q
from drf_spectacular.utils import extend_schema
from rest_framework.permissions import IsAuthenticated
from rest_framework import viewsets

from .api_parameters import USER_LIST_QUERY_PARAMETERS
from .pagination import StandardResultsSetPagination
from .permissions import IsAdminForUserManagement
from .user_serializers import UserSerializer


User = get_user_model()


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().order_by('id')
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated, IsAdminForUserManagement]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
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
