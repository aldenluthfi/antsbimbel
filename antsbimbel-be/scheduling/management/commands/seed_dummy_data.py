import random
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone

from scheduling.models import Schedule, Student


class Command(BaseCommand):
    help = "Seed dummy tutors, students, and schedules with minimum target counts."

    FIRST_NAMES = [
        "Alya",
        "Bima",
        "Citra",
        "Dion",
        "Eka",
        "Farhan",
        "Gita",
        "Hendra",
        "Indra",
        "Jasmine",
        "Kevin",
        "Laras",
        "Maya",
        "Naufal",
        "Putri",
        "Rafi",
        "Salsa",
        "Tegar",
        "Vina",
        "Yusuf",
    ]

    LAST_NAMES = [
        "Pratama",
        "Saputra",
        "Wijaya",
        "Permata",
        "Nugroho",
        "Halim",
        "Kusuma",
        "Ramadhan",
        "Mahendra",
        "Lestari",
        "Hidayat",
        "Santoso",
        "Maulana",
        "Anjani",
        "Pangestu",
        "Fauzi",
        "Amelia",
        "Kurniawan",
        "Wibowo",
        "Siregar",
    ]

    def add_arguments(self, parser):
        parser.add_argument("--tutors", type=int, default=15, help="Minimum number of tutors")
        parser.add_argument("--students", type=int, default=50, help="Minimum number of students")
        parser.add_argument("--schedules", type=int, default=100, help="Minimum number of schedules")
        parser.add_argument(
            "--password",
            type=str,
            default="password123",
            help="Default password for newly created tutor accounts",
        )

    def handle(self, *args, **options):
        min_tutors = max(0, options["tutors"])
        min_students = max(0, options["students"])
        min_schedules = max(0, options["schedules"])
        default_password = options["password"]

        User = get_user_model()

        existing_tutors_qs = User.objects.filter(is_staff=False, is_superuser=False)
        existing_students_qs = Student.objects.all()

        tutors_to_create = max(0, min_tutors - existing_tutors_qs.count())
        students_to_create = max(0, min_students - existing_students_qs.count())

        created_tutors = self._create_tutors(User, tutors_to_create, default_password)
        created_students = self._create_students(students_to_create)

        tutors = list(User.objects.filter(is_staff=False, is_superuser=False))
        students = list(Student.objects.all())

        if not tutors:
            self.stderr.write(self.style.ERROR("No tutors available. Cannot create schedules."))
            return

        if not students:
            self.stderr.write(self.style.ERROR("No students available. Cannot create schedules."))
            return

        schedules_to_create = max(0, min_schedules - Schedule.objects.count())
        created_schedules = self._create_schedules(schedules_to_create, tutors, students)

        self.stdout.write(self.style.SUCCESS("Dummy data seeding complete."))
        self.stdout.write(f"Tutors created: {created_tutors}")
        self.stdout.write(f"Students created: {created_students}")
        self.stdout.write(f"Schedules created: {created_schedules}")
        self.stdout.write(
            "Current totals -> "
            f"Tutors: {User.objects.filter(is_staff=False, is_superuser=False).count()}, "
            f"Students: {Student.objects.count()}, "
            f"Schedules: {Schedule.objects.count()}"
        )

    def _create_tutors(self, User, count, default_password):
        created = 0
        current_index = User.objects.count() + 1

        while created < count:
            username = f"tutor{current_index:03d}"
            current_index += 1

            if User.objects.filter(username=username).exists():
                continue

            first_name = random.choice(self.FIRST_NAMES)
            last_name = random.choice(self.LAST_NAMES)

            User.objects.create_user(
                username=username,
                first_name=first_name,
                last_name=last_name,
                email=f"{username}@example.com",
                password=default_password,
                is_staff=False,
                is_superuser=False,
                is_active=True,
            )
            created += 1

        return created

    def _create_students(self, count):
        created = 0

        while created < count:
            first_name = random.choice(self.FIRST_NAMES)
            last_name = random.choice(self.LAST_NAMES)
            Student.objects.create(first_name=first_name, last_name=last_name, is_active=True)
            created += 1

        return created

    def _create_schedules(self, count, tutors, students):
        if count <= 0:
            return 0

        now = timezone.now()
        subjects = [
            "Mathematics",
            "Physics",
            "Chemistry",
            "Biology",
            "English",
            "Bahasa Indonesia",
            "Economics",
            "Computer Science",
            "History",
            "Geography",
        ]
        statuses = [
            Schedule.STATUS_UPCOMING,
            Schedule.STATUS_DONE,
            Schedule.STATUS_CANCELLED,
            Schedule.STATUS_RESCHEDULED,
        ]

        schedules = []
        for _ in range(count):
            day_offset = random.randint(-(count // 6), (count // 6))
            hour_offset = random.randint(7, 19)
            minute_offset = random.choice([0, 15, 30, 45])
            scheduled_at = (now + timedelta(days=day_offset)).replace(
                hour=hour_offset,
                minute=minute_offset,
                second=0,
                microsecond=0,
            )

            tutor = random.choice(tutors)
            student = random.choice(students)

            schedules.append(
                Schedule(
                    tutor=tutor,
                    student=student,
                    subject_topic=random.choice(subjects),
                    scheduled_at=scheduled_at,
                    status=random.choice(statuses),
                )
            )

        Schedule.objects.bulk_create(schedules, batch_size=200)
        return len(schedules)
