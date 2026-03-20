from django.conf import settings
from django.db import models
from django.utils import timezone


class Student(models.Model):
	student_id = models.CharField(max_length=64, unique=True)
	full_name = models.CharField(max_length=255)
	is_active = models.BooleanField(default=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ('student_id',)

	def __str__(self):
		return f'{self.student_id} - {self.full_name}'

	@classmethod
	def _next_student_id(cls):
		prefix = 'STD'
		for student in cls.objects.order_by('-id').only('student_id'):
			if student.student_id.startswith(prefix):
				suffix = student.student_id[len(prefix):]
				if suffix.isdigit():
					return f'{prefix}{int(suffix) + 1:04d}'
		return f'{prefix}0001'

	def save(self, *args, **kwargs):
		if not self.student_id:
			candidate = self._next_student_id()
			while Student.objects.filter(student_id=candidate).exists():
				prefix = 'STD'
				next_number = int(candidate[len(prefix):]) + 1
				candidate = f'{prefix}{next_number:04d}'
			self.student_id = candidate
		super().save(*args, **kwargs)


class CheckIn(models.Model):
	tutor = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		on_delete=models.PROTECT,
		related_name='check_ins',
	)
	student_id = models.CharField(max_length=64)
	check_in_time = models.DateTimeField(default=timezone.now)
	check_in_location = models.CharField(max_length=255)
	check_in_photo = models.ImageField(upload_to='attendance/checkins/')

	def __str__(self):
		return f'CheckIn #{self.pk} - Tutor {self.tutor_id}'


class CheckOut(models.Model):
	check_in = models.OneToOneField(
		CheckIn,
		on_delete=models.CASCADE,
		related_name='check_out',
	)
	check_out_time = models.DateTimeField(default=timezone.now)
	check_out_photo = models.ImageField(upload_to='attendance/checkouts/')
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
	student_id = models.CharField(max_length=64)
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
		return f'Schedule #{self.pk} - Tutor {self.tutor_id}'
