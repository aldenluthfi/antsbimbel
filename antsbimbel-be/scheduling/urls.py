from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import AttendanceViewSet, LoginView, LogoutView, ScheduleViewSet, UserViewSet

router = DefaultRouter()
router.register(r'users', UserViewSet, basename='users')
router.register(r'attendance', AttendanceViewSet, basename='attendance')
router.register(r'schedules', ScheduleViewSet, basename='schedules')

urlpatterns = [
    path('auth/login/', LoginView.as_view(), name='login'),
    path('auth/logout/', LogoutView.as_view(), name='logout'),
    path('', include(router.urls)),
]
