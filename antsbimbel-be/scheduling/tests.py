from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework.exceptions import ValidationError

from .google_gmail import GoogleGmailSendError
from .models import Schedule, Student
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

		Schedule.objects.create(
			tutor=self.tutor,
			student=self.student_with_schedule,
			subject_topic='Math',
			scheduled_at=timezone.now() + timedelta(days=1),
		)

	def test_tutor_can_list_only_students_with_their_schedule(self):
		self.client.force_authenticate(user=self.tutor)

		response = self.client.get(reverse('students-list'))

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data['count'], 1)
		self.assertEqual(response.data['results'][0]['id'], self.student_with_schedule.id)

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
				'password': 'StrongPass123!',
				'is_active': True,
			}
		)

		self.assertTrue(serializer.is_valid(), serializer.errors)
		created_user = serializer.save()

		gmail_sender_cls.assert_called_once()
		gmail_sender_cls.return_value.send_new_user_credentials_email.assert_called_once_with(
			to_email='newtutor@example.com',
			username='newtutor',
			password='StrongPass123!',
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
				'password': 'StrongPass123!',
				'is_active': True,
			}
		)

		self.assertTrue(serializer.is_valid(), serializer.errors)

		with self.assertRaises(ValidationError):
			serializer.save()

		self.assertFalse(User.objects.filter(username='rollbackuser').exists())
