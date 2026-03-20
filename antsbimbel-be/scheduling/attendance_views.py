import re

from django.http import HttpResponse
from django.utils.dateparse import parse_date, parse_datetime
from drf_spectacular.utils import OpenApiResponse, OpenApiTypes, extend_schema
from rest_framework.decorators import action
from rest_framework import mixins, status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .attendance_serializers import CheckInSerializer
from .auth_serializers import MessageSerializer
from .google_drive import GoogleDriveUploadError, GoogleDriveUploader
from .models import CheckIn
from .pagination import StandardResultsSetPagination
from .permissions import AttendancePermission, is_admin, is_tutor


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
