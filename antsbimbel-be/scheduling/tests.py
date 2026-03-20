from datetime import timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Schedule, Student


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

		self.student_with_schedule = Student.objects.create(full_name='Scheduled Student')
		self.student_without_schedule = Student.objects.create(full_name='Unscheduled Student')

		Schedule.objects.create(
			tutor=self.tutor,
			student_id=self.student_with_schedule.student_id,
			subject_topic='Math',
			scheduled_at=timezone.now() + timedelta(days=1),
		)

	def test_tutor_can_list_only_students_with_their_schedule(self):
		self.client.force_authenticate(user=self.tutor)

		response = self.client.get(reverse('students-list'))

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data['count'], 1)
		self.assertEqual(response.data['results'][0]['student_id'], self.student_with_schedule.student_id)

	def test_tutor_cannot_create_student(self):
		self.client.force_authenticate(user=self.tutor)

		response = self.client.post(
			reverse('students-list'),
			{
				'full_name': 'New Student',
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
