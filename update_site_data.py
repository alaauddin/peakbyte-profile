import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'project.settings')
django.setup()

from profile_company.models import SiteDataSingleton, Service, Project

def update_data():
    # Update Site Data
    site_data = SiteDataSingleton.load()
    site_data.about = "PeakByte IT Solutions is a specialized engineering and technology firm dedicated to delivering high-integrity security, communication, and infrastructure systems."
    site_data.contact_email = "info@peak-byte.com"
    site_data.contact_phone = "+967 771773440"
    site_data.address = "Aden, Yemen"
    site_data.stat_projects = 150
    site_data.stat_clients = 85
    site_data.stat_years = 20
    site_data.stat_awards = 12
    site_data.save()
    print("Site data updated.")

    # Clear old services and add new ones from PDF
    Service.objects.all().delete()
    services = [
        ("IP Networking & Server Room Solutions", "Complete design and implementation of enterprise network architectures, structured cabling, and mission-critical server room environments."),
        ("Fiber Optic Networks & Solutions", "High-speed fiber optic backbone installation, precision splicing, and termination for high-bandwidth, long-distance communication infrastructure."),
        ("CCTV & Advanced Surveillance", "Enterprise-grade IP-CCTV solutions featuring AI-driven analytics, remote monitoring, and high-resolution video management systems."),
        ("Access Control Systems", "Integrated entry management including biometric authentication, RFID technology, and smart-gate control systems."),
        ("Public Address & IP-PA Systems", "Sophisticated IP-based public address and emergency voice evacuation systems designed for clear communication in large-scale facilities."),
        ("Fire Alarm & Life Safety Systems", "Intelligent fire detection and alarm systems engineered to provide rapid response and maximum protection of human life and physical assets."),
        ("Conference Rooms & Audiovisual (AV)", "Modern AV solutions for boardrooms and training centers, including integrated video conferencing and high-fidelity sound systems."),
        ("Queue & Customer Service Management (CCS)", "Automated queue management and customer flow systems (CCS) designed to enhance service quality and operational throughput."),
        ("Software & Integration Solutions", "Custom software development and multi-system integration to ensure a seamless interface between security hardware and business workflows."),
    ]
    for name, desc in services:
        Service.objects.create(name=name, description=desc)
    print("Services updated.")

if __name__ == "__main__":
    update_data()
