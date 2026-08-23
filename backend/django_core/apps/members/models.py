from django.db import models
import uuid

class MemberProfile(models.Model):
    ROLE_CHOICES = [
        ('admin', 'Admin'),
        ('resident', 'Resident'),
        ('guard', 'Guard'),
        ('superadmin', 'Superadmin'),
    ]
    RESIDENT_TYPE_CHOICES = [
        ('primary', 'Primary Resident'),
        ('household', 'Household Member'),
    ]
    STATUS_CHOICES = [
        ('pending', 'Pending Approval'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('removed', 'Removed'),
    ]

    uid = models.CharField(max_length=128, primary_key=True) # Firebase UID
    email = models.EmailField(blank=True, null=True)
    phone = models.CharField(max_length=32, blank=True, null=True)
    name = models.CharField(max_length=255)
    role = models.CharField(max_length=16, choices=ROLE_CHOICES, default='resident')
    resident_type = models.CharField(max_length=16, choices=RESIDENT_TYPE_CHOICES, default='primary')
    society_id = models.CharField(max_length=64, db_index=True)
    unit_number = models.CharField(max_length=32, blank=True, null=True)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='approved')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'member_profiles'

    def __str__(self):
        return f"{self.name} ({self.role}) - Unit {self.unit_number or 'N/A'}"
