from rest_framework import serializers
from .models import Society, Unit

class UnitSerializer(serializers.ModelSerializer):
    class Meta:
        model = Unit
        fields = ['id', 'unit_number', 'floor_number', 'status', 'occupied_by', 'intercom_number', 'created_at']

class SocietySerializer(serializers.ModelSerializer):
    units = UnitSerializer(many=True, read_only=True)

    class Meta:
        model = Society
        fields = [
            'id', 'name', 'address', 'admin_email', 'admin_id',
            'number_of_floors', 'units_per_floor', 'total_apartments',
            'is_setup_complete', 'created_at', 'updated_at', 'units'
        ]

class SocietyProvisionSerializer(serializers.Serializer):
    society_id = serializers.CharField(max_length=64)
    name = serializers.CharField(max_length=255)
    address = serializers.CharField()
    admin_email = serializers.EmailField()
    number_of_floors = serializers.IntegerField(min_value=1, max_value=100)
    units_per_floor = serializers.IntegerField(min_value=1, max_value=50)
