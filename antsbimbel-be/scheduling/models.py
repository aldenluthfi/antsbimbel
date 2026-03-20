from django.conf import settings
from django.db import models
from django.utils import timezone


class Student(models.Model):
	first_name = models.CharField(max_length=150)
	last_name = models.CharField(max_length=150, blank=True)
	is_active = models.BooleanField(default=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ('id',)

	def __str__(self):
		display_name = f'{(self.first_name or "").strip()} {(self.last_name or "").strip()}'.strip()
		return f'#{self.id} - {display_name or f"#{self.id}"}'


class CheckIn(models.Model):
	tutor = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		on_delete=models.PROTECT,
		related_name='check_ins',
	)
	student = models.ForeignKey(
		Student,
		on_delete=models.PROTECT,
		related_name='check_in_records',
	)
	check_in_time = models.DateTimeField(default=timezone.now)
	check_in_location = models.CharField(max_length=255)
	check_in_photo = models.URLField(max_length=2048)

	def __str__(self):
		return f'CheckIn #{self.pk} - Tutor {self.tutor.id}'


class CheckOut(models.Model):
	check_in = models.OneToOneField(
		CheckIn,
		on_delete=models.CASCADE,
		related_name='check_out',
	)
	check_out_time = models.DateTimeField(default=timezone.now)
	check_out_photo = models.URLField(max_length=2048)
	total_shift_time = models.DurationField(blank=True, null=True)

	def save(self, *args, **kwargs):
		if self.check_in and self.check_out_time and self.check_in.check_in_time:
			self.total_shift_time = self.check_out_time - self.check_in.check_in_time
		super().save(*args, **kwargs)

	def __str__(self):
		return f'CheckOut #{self.pk} for CheckIn {self.check_in_id}'


class Schedule(models.Model):
	STATUS_UPCOMING = 'upcoming'
	STATUS_DONE = 'done'
	STATUS_CANCELLED = 'cancelled'
	STATUS_RESCHEDULED = 'rescheduled'

	STATUS_CHOICES = (
		(STATUS_UPCOMING, 'Upcoming'),
		(STATUS_DONE, 'Done'),
		(STATUS_CANCELLED, 'Cancelled'),
		(STATUS_RESCHEDULED, 'Rescheduled'),
	)

	tutor = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		on_delete=models.PROTECT,
		related_name='schedules',
	)
	student = models.ForeignKey(
		Student,
		on_delete=models.PROTECT,
		related_name='schedule_records',
	)
	subject_topic = models.CharField(max_length=255)
	scheduled_at = models.DateTimeField()
	status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_UPCOMING)
	check_in = models.OneToOneField(
		CheckIn,
		on_delete=models.SET_NULL,
		related_name='schedule',
		null=True,
		blank=True,
	)

	def __str__(self):
		return f'Schedule #{self.pk} - Tutor {self.tutor.id}'
