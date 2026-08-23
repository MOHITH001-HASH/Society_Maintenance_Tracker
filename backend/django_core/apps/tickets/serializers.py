from rest_framework import serializers
from .models import MaintenanceTicket

class MaintenanceTicketSerializer(serializers.ModelSerializer):
    class Meta:
        model = MaintenanceTicket
        fields = [
            'id', 'society_id', 'unit_number', 'title', 'description',
            'category', 'priority', 'status', 'is_escalated',
            'escalation_note', 'created_by_uid', 'created_by_name',
            'created_at', 'resolved_at'
        ]

class CreateTicketSerializer(serializers.Serializer):
    society_id = serializers.CharField(max_length=64)
    unit_number = serializers.CharField(max_length=32)
    title = serializers.CharField(max_length=255)
    description = serializers.CharField()
    category = serializers.CharField(max_length=64)
    priority = serializers.ChoiceField(choices=['low', 'normal', 'high', 'urgent'], default='normal')
    created_by_uid = serializers.CharField(max_length=128)
    created_by_name = serializers.CharField(max_length=255)
