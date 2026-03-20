from django.contrib import admin
from .models import CheckIn, CheckOut, Schedule, Student


@admin.register(Student)
class StudentAdmin(admin.ModelAdmin):
	list_display = ('id', 'student_id', 'full_name', 'is_active')
	search_fields = ('student_id', 'full_name')
	list_filter = ('is_active',)


@admin.register(CheckIn)
class CheckInAdmin(admin.ModelAdmin):
	list_display = ('id', 'tutor', 'student_id', 'check_in_time', 'check_in_location')
	search_fields = ('student_id', 'tutor__username', 'check_in_location')
	list_filter = ('check_in_time',)


@admin.register(CheckOut)
class CheckOutAdmin(admin.ModelAdmin):
	list_display = ('id', 'check_in', 'check_out_time', 'total_shift_time')
	search_fields = ('check_in__student_id', 'check_in__tutor__username')
	list_filter = ('check_out_time',)


@admin.register(Schedule)
class ScheduleAdmin(admin.ModelAdmin):
	list_display = ('id', 'tutor', 'student_id', 'subject_topic', 'scheduled_at', 'status')
	search_fields = ('student_id', 'subject_topic', 'tutor__username')
	list_filter = ('status', 'scheduled_at')
