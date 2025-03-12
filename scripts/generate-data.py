#!/usr/bin/env python3
# generate-data.py - Generate test data for the EDR/XDR system

#######################
# Imports
#######################
import json
import random
import time
import uuid
import argparse
import sys
from typing import List, Dict, Any

# Optional Kafka imports
try:
    from kafka import KafkaProducer, KafkaAdminClient
    from kafka.admin import NewTopic
    kafka_available = True
except ImportError:
    kafka_available = False
    print("WARNING: kafka-python package not installed. Install it with 'pip install kafka-python'")

#######################
# Constants
#######################
# Configuration defaults
DEFAULT_KAFKA_BROKER = "localhost:9092"
DEFAULT_NUM_ENDPOINTS = 10
DEFAULT_EVENTS_PER_SECOND = 500  # Changed from 100 to 500 as requested
DEFAULT_TEST_DURATION = 60  # seconds
DEFAULT_TOPIC_NAME = "raw-events"

# Event types and properties
EVENT_TYPES = ["process", "network", "file", "registry", "login", "usb", "dns"]
PROCESS_NAMES = [
    "svchost.exe", "explorer.exe", "chrome.exe", "firefox.exe", "outlook.exe", "powershell.exe", 
    "cmd.exe", "rundll32.exe", "iexplore.exe", "notepad.exe", "taskmgr.exe", "mimikatz.exe",
    "java.exe", "python.exe", "node.exe", "excel.exe", "word.exe", "calculator.exe"
]
USERS = [
    "SYSTEM", "Administrator", "LocalService", "NetworkService", "JohnDoe", "JaneDoe", 
    "GuestUser", "DomainAdmin", "BackupOperator", "RemoteDesktopUser"
]
STATUS_OPTIONS = ["success", "failed", "blocked", "allowed", "detected"]
DIRECTION_OPTIONS = ["inbound", "outbound", "local"]
IP_PREFIXES = ["10.0.0.", "192.168.1.", "172.16.5.", "8.8.8.", "1.1.1."]

#######################
# Utility Functions
#######################
def ensure_topic_exists(kafka_broker: str, topic_name: str) -> None:
    """
    Try to ensure the Kafka topic exists, creating it if necessary.
    
    Args:
        kafka_broker: The Kafka broker address
        topic_name: The name of the topic to create
    """
    if not kafka_available:
        return
        
    try:
        admin_client = KafkaAdminClient(bootstrap_servers=kafka_broker)
        topics = admin_client.list_topics()
        if topic_name not in topics:
            print(f"Topic {topic_name} doesn't exist. Creating it...")
            topic_list = [NewTopic(name=topic_name, num_partitions=6, replication_factor=1)]
            admin_client.create_topics(new_topics=topic_list, validate_only=False)
            print(f"Topic {topic_name} created successfully.")
        else:
            print(f"Topic {topic_name} already exists.")
        admin_client.close()
    except Exception as e:
        print(f"Error checking/creating topic: {e}")
        print(f"You may need to manually create the topic using: docker exec edr-redpanda rpk topic create {topic_name}")

def generate_endpoint_id() -> str:
    """Generate a random endpoint ID."""
    return f"endpoint-{uuid.uuid4().hex[:8]}"

def generate_ip() -> str:
    """Generate a random IP address."""
    prefix = random.choice(IP_PREFIXES)
    suffix = random.randint(1, 254)
    return f"{prefix}{suffix}"

#######################
# Event Generation
#######################
def generate_event(endpoint_id: str) -> Dict[str, Any]:
    """
    Generate a random security event.
    
    Args:
        endpoint_id: The ID of the endpoint generating the event
        
    Returns:
        A dictionary containing the event data
    """
    event_type = random.choice(EVENT_TYPES)
    
    event = {
        "id": str(uuid.uuid4()),
        "timestamp": int(time.time() * 1000),
        "endpoint_id": endpoint_id,
        "event_type": event_type,
        "status": random.choice(STATUS_OPTIONS),
        "bytes": random.randint(100, 1000000) if event_type == "network" else 0,
        "source_ip": generate_ip() if event_type == "network" else "",
        "destination_ip": generate_ip() if event_type == "network" else "",
        "process_name": random.choice(PROCESS_NAMES) if event_type in ["process", "network"] else "",
        "user": random.choice(USERS),
        "direction": random.choice(DIRECTION_OPTIONS) if event_type == "network" else ""
    }
    
    return event

def generate_suspicious_events(endpoint_id: str) -> List[Dict[str, Any]]:
    """
    Generate a series of suspicious events that should trigger detection rules.
    
    Args:
        endpoint_id: The ID of the endpoint generating the events
        
    Returns:
        A list of suspicious events
    """
    events = []
    
    # Pattern 1: Multiple failed logins from the same user (Authentication Brute Force)
    failing_user = random.choice(USERS)
    for _ in range(3):
        event = {
            "id": str(uuid.uuid4()),
            "timestamp": int(time.time() * 1000),
            "endpoint_id": endpoint_id,
            "event_type": "login",
            "status": "failed",
            "bytes": 0,
            "source_ip": generate_ip(),
            "destination_ip": "",
            "process_name": "",
            "user": failing_user,  # Same user for all failed login attempts
            "direction": ""
        }
        events.append(event)
        time.sleep(0.1)
    
    # Pattern 2: Suspicious process with network connection (Suspicious Process Network Activity)
    suspicious_process = random.choice(["mimikatz.exe", "powershell.exe", "cmd.exe"])
    
    process_event = {
        "id": str(uuid.uuid4()),
        "timestamp": int(time.time() * 1000),
        "endpoint_id": endpoint_id,
        "event_type": "process",
        "status": "success",
        "bytes": 0,
        "source_ip": "",
        "destination_ip": "",
        "process_name": suspicious_process,  # Suspicious process
        "user": "Administrator",
        "direction": ""
    }
    events.append(process_event)
    time.sleep(0.1)
    
    network_event = {
        "id": str(uuid.uuid4()),
        "timestamp": int(time.time() * 1000),
        "endpoint_id": endpoint_id,
        "event_type": "network",
        "status": "success",
        "bytes": random.randint(1000, 10000),
        "source_ip": "192.168.1.100",
        "destination_ip": "8.8.8.200",
        "process_name": suspicious_process,  # Same suspicious process name
        "user": "Administrator",
        "direction": "outbound"
    }
    events.append(network_event)
    
    # Pattern 3: File write followed by execution (Suspicious File Execution)
    malicious_file_name = "malware.exe"
    
    file_write_event = {
        "id": str(uuid.uuid4()),
        "timestamp": int(time.time() * 1000),
        "endpoint_id": endpoint_id,
        "event_type": "file",
        "status": "write",
        "bytes": random.randint(1000, 50000),
        "source_ip": "",
        "destination_ip": "",
        "process_name": malicious_file_name,  # Name of the file being written
        "user": "Administrator",
        "direction": ""
    }
    events.append(file_write_event)
    time.sleep(0.1)
    
    file_execute_event = {
        "id": str(uuid.uuid4()),
        "timestamp": int(time.time() * 1000),
        "endpoint_id": endpoint_id,
        "event_type": "process",
        "status": "success",
        "bytes": 0,
        "source_ip": "",
        "destination_ip": "",
        "process_name": malicious_file_name,  # Same file now being executed
        "user": "Administrator",
        "direction": ""
    }
    events.append(file_execute_event)
    
    return events

#######################
# Output Functions
#######################
def write_events_to_file(events: List[Dict[str, Any]], filename: str = "generated_events.json") -> None:
    """
    Write events to a JSON file.
    
    Args:
        events: List of event dictionaries to write
        filename: The output filename
    """
    with open(filename, 'w') as f:
        json.dump(events, f, indent=2)
    print(f"✅ Wrote {len(events)} events to {filename}")

def send_events_to_kafka(
    kafka_broker: str, 
    endpoints: List[str], 
    events_per_second: int, 
    duration: int, 
    include_suspicious: bool = True, 
    topic_name: str = DEFAULT_TOPIC_NAME
) -> int:
    """
    Send events to Kafka broker.
    
    Args:
        kafka_broker: The Kafka broker address
        endpoints: List of endpoint IDs
        events_per_second: Number of events to send per second
        duration: Duration in seconds to send events
        include_suspicious: Whether to include suspicious events
        topic_name: The Kafka topic name
        
    Returns:
        The number of events sent
    """
    if not kafka_available:
        print("❌ Cannot send to Kafka - kafka-python package not installed")
        print("   Run: pip install kafka-python")
        return 0

    # Ensure topic exists
    ensure_topic_exists(kafka_broker, topic_name)
    
    try:
        producer = KafkaProducer(
            bootstrap_servers=kafka_broker,
            value_serializer=lambda v: json.dumps(v).encode('utf-8'),
            api_version=(0, 10, 0),  # Try compatibility mode
            request_timeout_ms=30000,  # Increase timeout to 30 seconds
            max_block_ms=30000,  # Max time to block on send
        )
    except Exception as e:
        print(f"❌ Error connecting to Kafka broker at {kafka_broker}: {e}")
        print("\nPossible issues and solutions:")
        print("1. Make sure Redpanda is running: docker ps | grep redpanda")
        print(f"2. Create the topic manually: docker exec edr-redpanda rpk topic create {topic_name}")
        print("3. Check if topics exist: docker exec edr-redpanda rpk topic list")
        print("4. Try using --file option to write events to file instead")
        return 0
    
    print(f"📊 Sending {events_per_second} events/second for {duration} seconds from {len(endpoints)} endpoints")
    print(f"🔄 Events will be sent to topic: {topic_name}")
    
    start_time = time.time()
    event_count = 0
    suspicious_sent = False
    all_events = []  # Collect all events in case we need to save to file
    
    try:
        while time.time() - start_time < duration:
            batch_size = max(1, int(events_per_second / 10))  # Send in smaller batches
            
            for _ in range(batch_size):
                endpoint_id = random.choice(endpoints)
                event = generate_event(endpoint_id)
                all_events.append(event)
                
                try:
                    producer.send(topic_name, event)
                    event_count += 1
                except Exception as e:
                    print(f"\n❌ Error sending event: {e}")
            
            # Send suspicious events after 10 seconds
            if include_suspicious and not suspicious_sent and time.time() - start_time > 10:
                suspicious_endpoint = random.choice(endpoints)
                suspicious_events = generate_suspicious_events(suspicious_endpoint)
                
                print("\n🚨 Sending suspicious events pattern...")
                print("   ↳ Pattern 1: Multiple failed logins - Should trigger 'Authentication Brute Force' detection")
                print("   ↳ Pattern 2: Suspicious process with network connection - Should trigger 'Suspicious Process Network Activity' detection")
                print("   ↳ Pattern 3: File write followed by execution - Should trigger 'Suspicious File Execution' detection")
                print(f"   ↳ All suspicious events sent from endpoint: {suspicious_endpoint}")
                
                for event in suspicious_events:
                    all_events.append(event)
                    try:
                        producer.send(topic_name, event)
                        event_count += 1
                    except Exception as e:
                        print(f"\n❌ Error sending suspicious event: {e}")
                
                suspicious_sent = True
            
            try:
                producer.flush(timeout=5)
            except Exception as e:
                print(f"\n❌ Error flushing messages: {e}")
                
            current_rate = event_count / (time.time() - start_time) if time.time() > start_time else 0
            elapsed = time.time() - start_time
            progress = min(100, (elapsed / duration) * 100)
            
            # Clear the line and update with progress bar
            sys.stdout.write("\r" + " " * 80)  # Clear line
            sys.stdout.write(f"\r⏳ Progress: [{('█' * int(progress/5)).ljust(20)}] {progress:.1f}% | Events: {event_count} | Rate: {current_rate:.1f}/sec")
            sys.stdout.flush()
            
            # Sleep to maintain the desired rate
            time.sleep(0.1)
    except KeyboardInterrupt:
        print("\n⏹️ Stopping event generation...")
    except Exception as e:
        print(f"\n❌ Error during event generation: {e}")
        
    try:
        producer.flush(timeout=5)
        producer.close(timeout=5)
    except Exception as _:
        pass
    
    print(f"\n✅ Total events sent: {event_count} in {time.time() - start_time:.2f} seconds")
    
    # If no events were sent successfully, save to file as fallback
    if event_count == 0 and all_events:
        print("⚠️ No events were sent successfully. Saving to file instead...")
        write_events_to_file(all_events)
        
    return event_count

#######################
# Main Function
#######################
def main():
    parser = argparse.ArgumentParser(description='EDR/XDR System Test Data Generator')
    parser.add_argument('--kafka', default=DEFAULT_KAFKA_BROKER, help='Kafka broker address')
    parser.add_argument('--endpoints', type=int, default=DEFAULT_NUM_ENDPOINTS, help='Number of simulated endpoints')
    parser.add_argument('--rate', type=int, default=DEFAULT_EVENTS_PER_SECOND, help='Events per second')
    parser.add_argument('--duration', type=int, default=DEFAULT_TEST_DURATION, help='Test duration in seconds')
    parser.add_argument('--no-suspicious', action='store_true', help='Don\'t generate suspicious events')
    parser.add_argument('--file', action='store_true', help='Write to file instead of Kafka')
    parser.add_argument('--topic', default=DEFAULT_TOPIC_NAME, help='Kafka topic name')
    args = parser.parse_args()
    
    # Use the topic name from args without global modification
    topic_name = args.topic
    
    print("\n🛡️  EDR/XDR Test Data Generator")
    print("=" * 50)
    print(f"📊 Configuration:")
    print(f"   ↳ Kafka Broker: {args.kafka}")
    print(f"   ↳ Endpoint Count: {args.endpoints}")
    print(f"   ↳ Event Rate: {args.rate}/second")
    print(f"   ↳ Duration: {args.duration} seconds")
    print(f"   ↳ Include Suspicious Events: {not args.no_suspicious}")
    print(f"   ↳ Topic Name: {topic_name}")
    print("=" * 50)
    
    # Generate endpoint IDs
    endpoints = [generate_endpoint_id() for _ in range(args.endpoints)]
    
    if args.file:
        # Generate events to file
        print("📝 Generating events to file...")
        all_events = []
        for _ in range(min(1000, args.rate * args.duration)):
            endpoint_id = random.choice(endpoints)
            all_events.append(generate_event(endpoint_id))
        
        # Add some suspicious events
        if not args.no_suspicious:
            suspicious_endpoint = random.choice(endpoints)
            print("\n🚨 Adding suspicious events to file...")
            print("   ↳ Pattern 1: Multiple failed logins - Should trigger 'Authentication Brute Force' detection")
            print("   ↳ Pattern 2: Suspicious process with network connection - Should trigger 'Suspicious Process Network Activity' detection")
            print("   ↳ Pattern 3: File write followed by execution - Should trigger 'Suspicious File Execution' detection")
            print(f"   ↳ All suspicious events from endpoint: {suspicious_endpoint}")
            all_events.extend(generate_suspicious_events(suspicious_endpoint))
            
        write_events_to_file(all_events)
    else:
        # Send events to Kafka
        send_events_to_kafka(
            args.kafka, 
            endpoints, 
            args.rate, 
            args.duration, 
            not args.no_suspicious,
            topic_name
        )

if __name__ == "__main__":
    main()
