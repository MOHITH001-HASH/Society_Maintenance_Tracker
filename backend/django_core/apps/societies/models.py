from django.db import models
import uuid

class Society(models.Model):
    id = models.CharField(max_length=64, primary_key=True)
    name = models.CharField(max_length=255)
    address = models.TextField()
    admin_email = models.EmailField()
    admin_id = models.CharField(max_length=128, blank=True, null=True)
    number_of_floors = models.IntegerField(default=1)
    units_per_floor = models.IntegerField(default=1)
    total_apartments = models.IntegerField(default=0)
    is_setup_complete = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'societies'
        verbose_name_plural = 'Societies'

    def __str__(self):
        return f"{self.name} ({self.id})"

class Unit(models.Model):
    STATUS_CHOICES = [
        ('unoccupied', 'Unoccupied'),
        ('occupied', 'Occupied'),
        ('rented', 'Rented'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    society = models.ForeignKey(Society, on_delete=models.CASCADE, related_name='units')
    unit_number = models.CharField(max_length=32)
    floor_number = models.IntegerField()
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='unoccupied')
    occupied_by = models.CharField(max_length=255, blank=True, null=True)
    intercom_number = models.CharField(max_length=32, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'units'
        unique_together = ('society', 'unit_number')

    def __str__(self):
        return f"{self.society.name} - Unit {self.unit_number}"
