from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .attendance_views import AttendanceViewSet
from .auth_views import LoginView, LogoutView
from .request_views import RequestViewSet
from .schedule_views import ScheduleViewSet
from .student_views import StudentViewSet
from .user_views import UserViewSet

router = DefaultRouter()
router.register(r'users', UserViewSet, basename='users')
router.register(r'students', StudentViewSet, basename='students')
router.register(r'attendance', AttendanceViewSet, basename='attendance')
router.register(r'schedules', ScheduleViewSet, basename='schedules')
router.register(r'requests', RequestViewSet, basename='requests')

urlpatterns = [
    path('auth/login/', LoginView.as_view(), name='login'),
    path('auth/logout/', LogoutView.as_view(), name='logout'),
    path('', include(router.urls)),
]
