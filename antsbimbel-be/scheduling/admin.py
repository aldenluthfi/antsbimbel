from django.contrib import admin
from .models import CheckIn, CheckOut, EmailBlastRecord, Schedule, Student


@admin.register(Student)
class StudentAdmin(admin.ModelAdmin):
	list_display = ('id', 'first_name', 'last_name', 'is_active')
	search_fields = ('=id', 'first_name', 'last_name')
	list_filter = ('is_active',)


@admin.register(CheckIn)
class CheckInAdmin(admin.ModelAdmin):
	list_display = ('id', 'tutor', 'student', 'check_in_time', 'check_in_location')
	search_fields = ('student__id', 'student__first_name', 'student__last_name', 'tutor__username', 'check_in_location')
	list_filter = ('check_in_time',)


@admin.register(CheckOut)
class CheckOutAdmin(admin.ModelAdmin):
	list_display = ('id', 'check_in', 'check_out_time', 'total_shift_time')
	search_fields = ('check_in__student__id', 'check_in__student__first_name', 'check_in__student__last_name', 'check_in__tutor__username')
	list_filter = ('check_out_time',)


@admin.register(Schedule)
class ScheduleAdmin(admin.ModelAdmin):
	list_display = ('id', 'tutor', 'student', 'subject_topic', 'start_datetime', 'end_datetime', 'status')
	search_fields = ('student__id', 'student__first_name', 'student__last_name', 'subject_topic', 'tutor__username')
	list_filter = ('status', 'start_datetime', 'end_datetime')


@admin.register(EmailBlastRecord)
class EmailBlastRecordAdmin(admin.ModelAdmin):
	list_display = ('id', 'admin', 'blast_type', 'period_start', 'period_end', 'created_at')
	search_fields = ('admin__username', 'admin__first_name', 'admin__last_name')
	list_filter = ('blast_type', 'period_start', 'period_end', 'created_at')
