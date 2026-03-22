from datetime import datetime, time, timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework.exceptions import ValidationError

from .google_gmail import GoogleGmailSendError
from .models import EmailBlastRecord, Request, Schedule, Student
from .serializers import UserSerializer


User = get_user_model()


class StudentAccessTests(APITestCase):
	def setUp(self):
		self.admin = User.objects.create_user(
			username='admin',
			password='password123',
			is_staff=True,
		)
		self.tutor = User.objects.create_user(
			username='tutor',
			password='password123',
			is_staff=False,
		)

		self.student_with_schedule = Student.objects.create(first_name='Scheduled', last_name='Student')
		self.student_without_schedule = Student.objects.create(first_name='Unscheduled', last_name='Student')

		next_day = timezone.localdate() + timedelta(days=1)
		start_datetime = timezone.make_aware(
			datetime.combine(next_day, time(hour=9, minute=0)),
			timezone.get_current_timezone(),
		)
		end_datetime = timezone.make_aware(
			datetime.combine(next_day, time(hour=10, minute=0)),
			timezone.get_current_timezone(),
		)

		Schedule.objects.create(
			tutor=self.tutor,
			student=self.student_with_schedule,
			subject_topic='Math',
			start_datetime=start_datetime,
			end_datetime=end_datetime,
		)

	def test_tutor_can_list_all_students(self):
		self.client.force_authenticate(user=self.tutor)

		response = self.client.get(reverse('students-list'))

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data['count'], 2)
		result_ids = {result['id'] for result in response.data['results']}
		self.assertSetEqual(result_ids, {self.student_with_schedule.id, self.student_without_schedule.id})

	def test_tutor_cannot_create_student(self):
		self.client.force_authenticate(user=self.tutor)

		response = self.client.post(
			reverse('students-list'),
			{
				'first_name': 'New',
				'last_name': 'Student',
				'is_active': True,
			},
			format='json',
		)

		self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

	def test_admin_can_list_all_students(self):
		self.client.force_authenticate(user=self.admin)

		response = self.client.get(reverse('students-list'))

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data['count'], 2)
		self.assertEqual(response.data['results'][0]['id'], self.student_with_schedule.id)

class UserCreationEmailTests(APITestCase):
	@patch('scheduling.user_serializers.GoogleGmailSender')
	def test_create_user_sends_credentials_email(self, gmail_sender_cls):
		serializer = UserSerializer(
			data={
				'username': 'newtutor',
				'first_name': 'New',
				'last_name': 'Tutor',
				'email': 'newtutor@example.com',
				'is_active': True,
			}
		)

		self.assertTrue(serializer.is_valid(), serializer.errors)
		created_user = serializer.save()

		gmail_sender_cls.assert_called_once()
		gmail_sender_cls.return_value.send_new_user_credentials_email.assert_called_once_with(
			to_email='newtutor@example.com',
			username='newtutor',
			first_name='New',
			last_name='Tutor',
			password='new.tutor',
		)
		self.assertTrue(User.objects.filter(pk=created_user.pk).exists())

	@patch('scheduling.user_serializers.GoogleGmailSender')
	def test_create_user_rolls_back_when_email_fails(self, gmail_sender_cls):
		gmail_sender_cls.return_value.send_new_user_credentials_email.side_effect = GoogleGmailSendError('mail failed')

		serializer = UserSerializer(
			data={
				'username': 'rollbackuser',
				'first_name': 'Rollback',
				'last_name': 'User',
				'email': 'rollback@example.com',
				'is_active': True,
			}
		)

		self.assertTrue(serializer.is_valid(), serializer.errors)

		with self.assertRaises(ValidationError):
			serializer.save()

		self.assertFalse(User.objects.filter(username='rollbackuser').exists())


class TutorScheduleRequestTests(APITestCase):
	def setUp(self):
		self.admin = User.objects.create_user(
			username='admin',
			password='password123',
			is_staff=True,
		)
		self.tutor = User.objects.create_user(
			username='tutor',
			password='password123',
			is_staff=False,
		)
		self.student = Student.objects.create(first_name='Target', last_name='Student')

	def test_tutor_can_request_schedule(self):
		self.client.force_authenticate(user=self.tutor)

		next_day = timezone.localdate() + timedelta(days=1)
		start_datetime = timezone.make_aware(
			datetime.combine(next_day, time(hour=9, minute=0)),
			timezone.get_current_timezone(),
		)
		end_datetime = timezone.make_aware(
			datetime.combine(next_day, time(hour=11, minute=0)),
			timezone.get_current_timezone(),
		)

		response = self.client.post(
			reverse('schedules-request-schedule'),
			{
				'student': self.student.id,
				'subject_topic': 'Mathematics',
				'description': 'New student onboarding',
				'start_datetime': start_datetime.isoformat(),
				'end_datetime': end_datetime.isoformat(),
			},
			format='json',
		)

		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		self.assertIn('request_id', response.data)
		self.assertIn('schedule', response.data)

		schedule_id = response.data['schedule']['id']
		schedule = Schedule.objects.get(id=schedule_id)
		self.assertEqual(schedule.status, Schedule.STATUS_PENDING)
		self.assertEqual(schedule.tutor_id, self.tutor.id)
		self.assertEqual(schedule.student_id, self.student.id)

		request_record = Request.objects.get(id=response.data['request_id'])
		self.assertIsNone(request_record.old_schedule)
		self.assertEqual(request_record.new_schedule_id, schedule.id)
		self.assertEqual(request_record.status, Request.STATUS_PENDING)

	def test_tutor_request_rejects_duration_shorter_than_two_hours(self):
		self.client.force_authenticate(user=self.tutor)

		next_day = timezone.localdate() + timedelta(days=1)
		start_datetime = timezone.make_aware(
			datetime.combine(next_day, time(hour=9, minute=0)),
			timezone.get_current_timezone(),
		)
		end_datetime = timezone.make_aware(
			datetime.combine(next_day, time(hour=10, minute=0)),
			timezone.get_current_timezone(),
		)

		response = self.client.post(
			reverse('schedules-request-schedule'),
			{
				'student': self.student.id,
				'subject_topic': 'Mathematics',
				'description': 'Duration too short',
				'start_datetime': start_datetime.isoformat(),
				'end_datetime': end_datetime.isoformat(),
			},
			format='json',
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn('Schedule duration must be at least 2 hours.', str(response.data['end_datetime']))

	def test_tutor_request_rejects_duration_not_multiple_of_two_hours(self):
		self.client.force_authenticate(user=self.tutor)

		next_day = timezone.localdate() + timedelta(days=1)
		start_datetime = timezone.make_aware(
			datetime.combine(next_day, time(hour=9, minute=0)),
			timezone.get_current_timezone(),
		)
		end_datetime = timezone.make_aware(
			datetime.combine(next_day, time(hour=12, minute=0)),
			timezone.get_current_timezone(),
		)

		response = self.client.post(
			reverse('schedules-request-schedule'),
			{
				'student': self.student.id,
				'subject_topic': 'Mathematics',
				'description': 'Duration is 3 hours',
				'start_datetime': start_datetime.isoformat(),
				'end_datetime': end_datetime.isoformat(),
			},
			format='json',
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn('Schedule duration must be in multiples of 2 hours.', str(response.data['end_datetime']))

	def test_admin_create_rejects_duration_not_multiple_of_two_hours(self):
		self.client.force_authenticate(user=self.admin)

		next_day = timezone.localdate() + timedelta(days=1)
		start_datetime = timezone.make_aware(
			datetime.combine(next_day, time(hour=9, minute=0)),
			timezone.get_current_timezone(),
		)
		end_datetime = timezone.make_aware(
			datetime.combine(next_day, time(hour=12, minute=0)),
			timezone.get_current_timezone(),
		)

		response = self.client.post(
			reverse('schedules-list'),
			{
				'tutor': self.tutor.id,
				'student': self.student.id,
				'subject_topic': 'Mathematics',
				'description': 'Duration is 3 hours',
				'start_datetime': start_datetime.isoformat(),
				'end_datetime': end_datetime.isoformat(),
				'status': Schedule.STATUS_UPCOMING,
			},
			format='json',
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn('Schedule duration must be in multiples of 2 hours.', str(response.data['end_datetime']))

	def test_admin_cannot_request_schedule_via_tutor_endpoint(self):
		self.client.force_authenticate(user=self.admin)

		next_day = timezone.localdate() + timedelta(days=1)
		start_datetime = timezone.make_aware(
			datetime.combine(next_day, time(hour=9, minute=0)),
			timezone.get_current_timezone(),
		)
		end_datetime = timezone.make_aware(
			datetime.combine(next_day, time(hour=11, minute=0)),
			timezone.get_current_timezone(),
		)

		response = self.client.post(
			reverse('schedules-request-schedule'),
			{
				'student': self.student.id,
				'subject_topic': 'Mathematics',
				'description': 'Admin should be blocked',
				'start_datetime': start_datetime.isoformat(),
				'end_datetime': end_datetime.isoformat(),
			},
			format='json',
		)

		self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class ResetPasswordFlowTests(APITestCase):
	def setUp(self):
		self.admin = User.objects.create_user(
			username='admin-reset',
			password='password123',
			is_staff=True,
		)
		self.other_admin = User.objects.create_user(
			username='other-admin',
			password='password123',
			is_staff=True,
		)
		self.tutor = User.objects.create_user(
			username='reset-tutor',
			password='password123',
			first_name='Reset',
			last_name='Tutor',
			email='reset-tutor@example.com',
			is_staff=False,
		)

	@patch('scheduling.auth_views.GoogleGmailSender')
	def test_admin_can_reset_tutor_password_to_default_and_send_email(self, gmail_sender_cls):
		self.client.force_authenticate(user=self.admin)

		response = self.client.post(
			reverse('reset-password'),
			{'user_id': self.tutor.id},
			format='json',
		)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.tutor.refresh_from_db()
		self.assertTrue(self.tutor.check_password('reset.tutor'))
		gmail_sender_cls.assert_called_once()
		gmail_sender_cls.return_value.send_new_user_credentials_email.assert_called_once_with(
			to_email='reset-tutor@example.com',
			username='reset-tutor',
			first_name='Reset',
			last_name='Tutor',
			password='reset.tutor',
		)

	def test_admin_cannot_reset_admin_password(self):
		self.client.force_authenticate(user=self.admin)

		response = self.client.post(
			reverse('reset-password'),
			{'user_id': self.other_admin.id},
			format='json',
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertEqual(response.data['detail'][0], 'Admin password cannot be reset.')

	def test_tutor_can_reset_own_password_with_old_and_confirmation(self):
		self.client.force_authenticate(user=self.tutor)

		response = self.client.post(
			reverse('reset-password'),
			{
				'old_password': 'password123',
				'new_password': 'NewStrongPass123!',
				'confirm_new_password': 'NewStrongPass123!',
			},
			format='json',
		)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.tutor.refresh_from_db()
		self.assertTrue(self.tutor.check_password('NewStrongPass123!'))

	def test_tutor_cannot_reset_other_user_password(self):
		self.client.force_authenticate(user=self.tutor)

		response = self.client.post(
			reverse('reset-password'),
			{
				'user_id': self.admin.id,
				'old_password': 'password123',
				'new_password': 'NewStrongPass123!',
				'confirm_new_password': 'NewStrongPass123!',
			},
			format='json',
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertEqual(response.data['user_id'][0], 'Tutors can only reset their own password.')


class EmailBlastPermissionTests(APITestCase):
	def setUp(self):
		self.admin = User.objects.create_user(
			username='blast-admin',
			password='password123',
			is_staff=True,
			email='blast-admin@example.com',
		)
		self.tutor = User.objects.create_user(
			username='blast-tutor',
			password='password123',
			is_staff=False,
			email='blast-tutor@example.com',
		)
		self.student = Student.objects.create(
			first_name='Blast',
			last_name='Student',
			email='blast-student@example.com',
		)

		today = timezone.localdate()
		start_datetime = timezone.make_aware(
			datetime.combine(today, time(hour=9, minute=0)),
			timezone.get_current_timezone(),
		)
		end_datetime = timezone.make_aware(
			datetime.combine(today, time(hour=11, minute=0)),
			timezone.get_current_timezone(),
		)

		Schedule.objects.create(
			tutor=self.tutor,
			student=self.student,
			subject_topic='Reminder Subject',
			start_datetime=start_datetime,
			end_datetime=end_datetime,
			status=Schedule.STATUS_UPCOMING,
		)

	@patch('scheduling.email_blast.GoogleGmailSender')
	def test_daily_blast_once_per_day(self, gmail_sender_cls):
		self.client.force_authenticate(user=self.admin)

		first = self.client.post(
			reverse('schedules-email-blast'),
			{'mode': 'daily'},
			format='json',
		)
		self.assertEqual(first.status_code, status.HTTP_200_OK)
		self.assertEqual(first.data['mode'], 'daily')
		self.assertEqual(EmailBlastRecord.objects.filter(admin=self.admin, blast_type='daily').count(), 1)

		second = self.client.post(
			reverse('schedules-email-blast'),
			{'mode': 'daily'},
			format='json',
		)
		self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn('Daily blast is not available', second.data['detail'])
		gmail_sender_cls.assert_called()

	@patch('scheduling.email_blast.GoogleGmailSender')
	def test_weekly_blast_revokes_daily_for_same_week(self, gmail_sender_cls):
		self.client.force_authenticate(user=self.admin)

		weekly = self.client.post(
			reverse('schedules-email-blast'),
			{'mode': 'weekly'},
			format='json',
		)
		self.assertEqual(weekly.status_code, status.HTTP_200_OK)
		self.assertFalse(weekly.data['permission']['can_daily'])
		self.assertFalse(weekly.data['permission']['can_weekly'])

		daily_after_weekly = self.client.post(
			reverse('schedules-email-blast'),
			{'mode': 'daily'},
			format='json',
		)
		self.assertEqual(daily_after_weekly.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn('Daily blast is not available', daily_after_weekly.data['detail'])
		gmail_sender_cls.assert_called()

	@patch('scheduling.email_blast.GoogleGmailSender')
	def test_daily_blast_skips_pending_and_writes_single_summary_log(self, gmail_sender_cls):
		self.client.force_authenticate(user=self.admin)

		today = timezone.localdate()
		start_pending = timezone.make_aware(
			datetime.combine(today, time(hour=13, minute=0)),
			timezone.get_current_timezone(),
		)
		end_pending = timezone.make_aware(
			datetime.combine(today, time(hour=15, minute=0)),
			timezone.get_current_timezone(),
		)

		pending_schedule = Schedule.objects.create(
			tutor=self.tutor,
			student=self.student,
			subject_topic='Pending Subject',
			start_datetime=start_pending,
			end_datetime=end_pending,
			status=Schedule.STATUS_PENDING,
		)

		response = self.client.post(
			reverse('schedules-email-blast'),
			{'mode': 'daily'},
			format='json',
		)

		self.assertEqual(response.status_code, status.HTTP_200_OK)

		sender_instance = gmail_sender_cls.return_value
		self.assertEqual(sender_instance.send_schedule_reminder_email.call_count, 2)
		sender_instance.log_email_event.assert_called_once()

		for call in sender_instance.send_schedule_reminder_email.call_args_list:
			kwargs = call.kwargs
			self.assertFalse(kwargs['log_result'])
			schedule_ids = {item['id'] for item in kwargs['schedules']}
			self.assertNotIn(pending_schedule.id, schedule_ids)

	def test_permission_endpoint_reflects_state(self):
		self.client.force_authenticate(user=self.admin)

		before = self.client.get(reverse('schedules-email-blast-permission'))
		self.assertEqual(before.status_code, status.HTTP_200_OK)
		self.assertTrue(before.data['can_daily'])
		self.assertTrue(before.data['can_weekly'])

		today = timezone.localdate()
		week_start = today - timedelta(days=today.weekday())
		week_end = week_start + timedelta(days=6)
		EmailBlastRecord.objects.create(
			admin=self.admin,
			blast_type='weekly',
			period_start=week_start,
			period_end=week_end,
		)

		after = self.client.get(reverse('schedules-email-blast-permission'))
		self.assertEqual(after.status_code, status.HTTP_200_OK)
		self.assertFalse(after.data['can_daily'])
		self.assertFalse(after.data['can_weekly'])


class ScheduleExtensionFlowTests(APITestCase):
	def setUp(self):
		self.admin = User.objects.create_user(
			username='admin-extension',
			password='password123',
			is_staff=True,
		)
		self.tutor = User.objects.create_user(
			username='tutor-extension',
			password='password123',
			is_staff=False,
		)
		self.student = Student.objects.create(first_name='Extension', last_name='Student')

		next_day = timezone.localdate() + timedelta(days=1)
		self.start_datetime = timezone.make_aware(
			datetime.combine(next_day, time(hour=9, minute=0)),
			timezone.get_current_timezone(),
		)
		self.end_datetime = timezone.make_aware(
			datetime.combine(next_day, time(hour=11, minute=0)),
			timezone.get_current_timezone(),
		)

		self.schedule = Schedule.objects.create(
			tutor=self.tutor,
			student=self.student,
			subject_topic='Mathematics',
			description='Initial schedule',
			start_datetime=self.start_datetime,
			end_datetime=self.end_datetime,
			status=Schedule.STATUS_UPCOMING,
		)

	def _request_tutor_extension(self, end_hour):
		self.client.force_authenticate(user=self.tutor)
		new_end_datetime = timezone.make_aware(
			datetime.combine(timezone.localtime(self.end_datetime).date(), time(hour=end_hour, minute=0)),
			timezone.get_current_timezone(),
		)

		return self.client.patch(
			reverse('schedules-detail', args=[self.schedule.id]),
			{
				'start_datetime': self.start_datetime.isoformat(),
				'end_datetime': new_end_datetime.isoformat(),
			},
			format='json',
		)

	def test_tutor_same_start_creates_extension_request(self):
		response = self._request_tutor_extension(end_hour=13)

		self.assertEqual(response.status_code, status.HTTP_201_CREATED)
		self.assertIn('request_id', response.data)

		self.schedule.refresh_from_db()
		self.assertEqual(self.schedule.status, Schedule.STATUS_PENDING)

		request_obj = Request.objects.get(id=response.data['request_id'])
		self.assertEqual(request_obj.old_schedule_id, self.schedule.id)
		self.assertIsNone(request_obj.new_schedule)
		self.assertEqual(request_obj.extension, 2)
		self.assertEqual(request_obj.status, Request.STATUS_PENDING)

	def test_tutor_extension_approve_updates_old_schedule(self):
		request_response = self._request_tutor_extension(end_hour=13)
		request_id = request_response.data['request_id']

		self.client.force_authenticate(user=self.admin)
		approve_response = self.client.post(reverse('requests-approve', args=[request_id]), format='json')

		self.assertEqual(approve_response.status_code, status.HTTP_200_OK)

		self.schedule.refresh_from_db()
		self.assertEqual(self.schedule.status, Schedule.STATUS_EXTENDED)
		self.assertEqual(timezone.localtime(self.schedule.end_datetime).hour, 13)

		request_obj = Request.objects.get(id=request_id)
		self.assertEqual(request_obj.status, Request.STATUS_RESOLVED)

	def test_tutor_extension_reject_restores_upcoming(self):
		request_response = self._request_tutor_extension(end_hour=13)
		request_id = request_response.data['request_id']

		self.client.force_authenticate(user=self.admin)
		reject_response = self.client.post(reverse('requests-reject', args=[request_id]), format='json')

		self.assertEqual(reject_response.status_code, status.HTTP_200_OK)

		self.schedule.refresh_from_db()
		self.assertEqual(self.schedule.status, Schedule.STATUS_UPCOMING)
		self.assertEqual(timezone.localtime(self.schedule.end_datetime).hour, 11)

		request_obj = Request.objects.get(id=request_id)
		self.assertEqual(request_obj.status, Request.STATUS_RESOLVED)

	def test_admin_same_start_sets_schedule_extended(self):
		self.client.force_authenticate(user=self.admin)

		response = self.client.patch(
			reverse('schedules-detail', args=[self.schedule.id]),
			{
				'start_datetime': self.start_datetime.isoformat(),
				'end_datetime': timezone.make_aware(
					datetime.combine(timezone.localtime(self.end_datetime).date(), time(hour=13, minute=0)),
					timezone.get_current_timezone(),
				).isoformat(),
			},
			format='json',
		)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data['id'], self.schedule.id)
		self.assertEqual(response.data['status'], Schedule.STATUS_EXTENDED)
		self.assertEqual(Schedule.objects.count(), 1)

	def test_admin_different_start_keeps_reschedule_flow(self):
		self.client.force_authenticate(user=self.admin)

		next_start_datetime = timezone.make_aware(
			datetime.combine(timezone.localtime(self.start_datetime).date(), time(hour=10, minute=0)),
			timezone.get_current_timezone(),
		)
		next_end_datetime = timezone.make_aware(
			datetime.combine(timezone.localtime(self.end_datetime).date(), time(hour=12, minute=0)),
			timezone.get_current_timezone(),
		)

		response = self.client.patch(
			reverse('schedules-detail', args=[self.schedule.id]),
			{
				'start_datetime': next_start_datetime.isoformat(),
				'end_datetime': next_end_datetime.isoformat(),
			},
			format='json',
		)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertNotEqual(response.data['id'], self.schedule.id)
		self.assertEqual(response.data['status'], Schedule.STATUS_UPCOMING)

		self.schedule.refresh_from_db()
		self.assertEqual(self.schedule.status, Schedule.STATUS_RESCHEDULED)
		self.assertEqual(Schedule.objects.count(), 2)
