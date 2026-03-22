from django.conf import settings
from django.db import models
from django.db.models import F, Q
from django.utils import timezone


class Student(models.Model):
	class Level(models.TextChoices):
		SD = 'SD', 'SD'
		SMP = 'SMP', 'SMP'
		SMA = 'SMA', 'SMA'

	first_name = models.CharField(max_length=150)
	last_name = models.CharField(max_length=150, blank=True)
	email = models.EmailField(blank=True, default='')
	level = models.CharField(max_length=3, choices=Level.choices, default=Level.SD)
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
	description = models.TextField(blank=True, default='')

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
	STATUS_MISSED = 'missed'
	STATUS_CANCELLED = 'cancelled'
	STATUS_RESCHEDULED = 'rescheduled'
	STATUS_EXTENDED = 'extended'
	STATUS_PENDING = 'pending'
	STATUS_REJECTED = 'rejected'

	STATUS_CHOICES = (
		(STATUS_UPCOMING, 'Upcoming'),
		(STATUS_DONE, 'Done'),
		(STATUS_MISSED, 'Missed'),
		(STATUS_CANCELLED, 'Cancelled'),
		(STATUS_RESCHEDULED, 'Rescheduled'),
		(STATUS_EXTENDED, 'Extended'),
		(STATUS_PENDING, 'Pending'),
		(STATUS_REJECTED, 'Rejected'),
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
	description = models.TextField(blank=True, default='')
	start_datetime = models.DateTimeField()
	end_datetime = models.DateTimeField()
	status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_UPCOMING)
	check_in = models.OneToOneField(
		CheckIn,
		on_delete=models.SET_NULL,
		related_name='schedule',
		null=True,
		blank=True,
	)

	class Meta:
		constraints = [
			models.CheckConstraint(
				check=Q(start_datetime__lt=F('end_datetime')),
				name='schedule_start_before_end',
			),
			models.CheckConstraint(
				check=Q(start_datetime__date=F('end_datetime__date')),
				name='schedule_start_end_same_date',
			),
		]

	def __str__(self):
		return f'Schedule #{self.pk} - Tutor {self.tutor.id}'

	@property
	def can_check_in(self):
		if self.status not in {self.STATUS_UPCOMING, self.STATUS_PENDING}:
			return False

		check_in_open_time = self.start_datetime - timezone.timedelta(minutes=15)
		return timezone.now() >= check_in_open_time

	@property
	def can_check_out(self):
		if self.status not in {self.STATUS_UPCOMING, self.STATUS_PENDING}:
			return False

		if not self.check_in_id:
			return False

		check_in = getattr(self, 'check_in', None)
		if check_in and getattr(check_in, 'check_out', None):
			return False

		now = timezone.now()
		check_out_open_time = self.end_datetime - timezone.timedelta(minutes=15)
		check_out_close_time = self.end_datetime + timezone.timedelta(minutes=30)
		return check_out_open_time <= now <= check_out_close_time


class Request(models.Model):
	STATUS_PENDING = 'pending'
	STATUS_RESOLVED = 'resolved'

	STATUS_CHOICES = (
		(STATUS_PENDING, 'Pending'),
		(STATUS_RESOLVED, 'Resolved'),
	)

	old_schedule = models.ForeignKey(
		Schedule,
		on_delete=models.SET_NULL,
		related_name='old_schedule_requests',
		null=True,
		blank=True,
	)
	new_schedule = models.ForeignKey(
		Schedule,
		on_delete=models.PROTECT,
		related_name='new_schedule_requests',
		null=True,
		blank=True,
	)
	extension = models.PositiveSmallIntegerField(null=True, blank=True)
	status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_PENDING)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ('-created_at', 'id')

	def __str__(self):
		if self.new_schedule_id:
			return f'Request #{self.pk} - New schedule {self.new_schedule_id}'
		return f'Request #{self.pk} - Old schedule {self.old_schedule_id}'


class EmailBlastRecord(models.Model):
	TYPE_DAILY = 'daily'
	TYPE_WEEKLY = 'weekly'

	TYPE_CHOICES = (
		(TYPE_DAILY, 'Daily'),
		(TYPE_WEEKLY, 'Weekly'),
	)

	admin = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		on_delete=models.CASCADE,
		related_name='email_blast_records',
	)
	blast_type = models.CharField(max_length=16, choices=TYPE_CHOICES)
	period_start = models.DateField()
	period_end = models.DateField()
	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		ordering = ('-created_at', 'id')
		constraints = [
			models.UniqueConstraint(
				fields=['admin', 'blast_type', 'period_start', 'period_end'],
				name='unique_email_blast_record_per_admin_period',
			),
		]

	def __str__(self):
		return f'EmailBlast #{self.pk} {self.blast_type} ({self.period_start}..{self.period_end})'
