from datetime import datetime, time, timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework.exceptions import ValidationError

from .google_gmail import GoogleGmailSendError
from .models import Request, Schedule, Student
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
