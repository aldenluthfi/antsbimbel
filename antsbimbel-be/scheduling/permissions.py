from rest_framework.permissions import BasePermission, SAFE_METHODS


def is_admin(user):
    return bool(user and user.is_authenticated and user.is_staff)


def is_tutor(user):
    return bool(user and user.is_authenticated and not user.is_staff)


class IsAdminForUserManagement(BasePermission):
    def has_permission(self, request, view):
        return is_admin(request.user)


class StudentPermission(BasePermission):
    """
    Admin: full CRUD for students.
    Tutor: read-only access.
    """

    def has_permission(self, request, view):
        user = request.user

        if is_admin(user):
            return True

        if is_tutor(user):
            return request.method in SAFE_METHODS

        return False


class AttendancePermission(BasePermission):
    """
    Admin: read and delete attendance records.
    Tutor: create, read, and update only their own records.
    """

    def has_permission(self, request, view):
        user = request.user
        if is_admin(user):
            return request.method in SAFE_METHODS or request.method == 'DELETE'
        if is_tutor(user):
            return request.method in SAFE_METHODS or request.method in {'POST', 'PUT', 'PATCH'}
        return False

    def has_object_permission(self, request, view, obj):
        user = request.user

        if is_admin(user):
            return request.method in SAFE_METHODS or request.method == 'DELETE'

        if is_tutor(user):
            return obj.tutor.id == user.id and (
                request.method in SAFE_METHODS or request.method in {'PUT', 'PATCH'}
            )

        return False


class SchedulePermission(BasePermission):
    """
    Admin: full CRUD for schedules.
    Tutor: read and patch only their own schedule records.
    """

    def has_permission(self, request, view):
        user = request.user

        if is_admin(user):
            return True

        if is_tutor(user):
            if request.method in SAFE_METHODS or request.method == 'PATCH':
                return True

            return request.method == 'POST' and getattr(view, 'action', None) == 'request_schedule'

        return False

    def has_object_permission(self, request, view, obj):
        user = request.user

        if is_admin(user):
            return True

        if is_tutor(user):
            return obj.tutor.id == user.id and (request.method in SAFE_METHODS or request.method == 'PATCH')

        return False


class RequestPermission(BasePermission):
    """
    Admin: full access for request management.
    Tutor: read-only access to their own requests.
    """

    def has_permission(self, request, view):
        user = request.user

        if is_admin(user):
            return True

        if is_tutor(user):
            return request.method in SAFE_METHODS

        return False

    def has_object_permission(self, request, view, obj):
        user = request.user

        if is_admin(user):
            return True

        if is_tutor(user):
            tutor_schedule = obj.new_schedule or obj.old_schedule
            return request.method in SAFE_METHODS and bool(tutor_schedule and tutor_schedule.tutor_id == user.id)

        return False
