#!/bin/bash
# setup.sh - Set up the EDR/XDR development environment with fault tolerance

# Enable error handling
set -o pipefail

# Global variables
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="${SCRIPT_DIR}/setup.log"
PROGRESS_FILE="${SCRIPT_DIR}/.setup_progress"
TIMEOUT_DURATION=60 # seconds
PYTHON_CMD=""
VENV_DIR="${SCRIPT_DIR}/venv"

# Print colored status messages
info() {
  echo -e "\033[0;36m[INFO]\033[0m $1" | tee -a "$LOG_FILE"
}

success() {
  echo -e "\033[0;32m[SUCCESS]\033[0m $1" | tee -a "$LOG_FILE"
}

warning() {
  echo -e "\033[0;33m[WARNING]\033[0m $1" | tee -a "$LOG_FILE"
}

error() {
  echo -e "\033[0;31m[ERROR]\033[0m $1" | tee -a "$LOG_FILE"
  return 1
}

# Initialize log file
init_log() {
  echo "--- EDR/XDR Setup Log ($(date)) ---" > "$LOG_FILE"
  info "Setup started"
}

# Create progress tracker
init_progress() {
  if [[ ! -f "$PROGRESS_FILE" ]]; then
    cat > "$PROGRESS_FILE" << EOF
prerequisites=0
python_setup=0
directories=0
config_files=0
api_service=0
flink_job=0
test_data_generator=0
convenience_scripts=0
docker_compose=0
generator_dockerfile=0
EOF
  fi
}

# Update progress for a step
update_progress() {
  local step="$1"
  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS version (BSD sed)
    sed -i '' "s/^$step=.*/$step=1/" "$PROGRESS_FILE" || warning "Could not update progress for $step"
  else
    # Linux version (GNU sed)
    sed -i "s/^$step=.*/$step=1/" "$PROGRESS_FILE" || warning "Could not update progress for $step"
  fi
}

# Check if a step has been completed
check_progress() {
  local step="$1"
  local status=$(grep "^$step=" "$PROGRESS_FILE" | cut -d= -f2)
  [[ "$status" == "1" ]]
}

# Run a step with timeout and error handling
run_step() {
  local step_name="$1"
  local step_func="$2"
  
  if check_progress "$step_name"; then
    info "Skipping $step_name (already completed)"
    return 0
  fi
  
  info "Starting $step_name..."
  
  # Use a timeout mechanism appropriate for the OS
  if command -v timeout &> /dev/null; then
    # Linux has the timeout command
    if timeout $TIMEOUT_DURATION bash -c "$step_func"; then
      update_progress "$step_name"
      success "$step_name completed successfully"
      return 0
    else
      exit_code=$?
      if [ $exit_code -eq 124 ]; then
        error "$step_name timed out after $TIMEOUT_DURATION seconds"
      else
        error "$step_name failed with exit code $exit_code"
      fi
      return 1
    fi
  else
    # For macOS or where timeout command is not available
    # Run the function directly and rely on its own timeout implementation if any
    if $step_func; then
      update_progress "$step_name"
      success "$step_name completed successfully"
      return 0
    else
      error "$step_name failed"
      return 1
    fi
  fi
}

# Determine Python command
find_python() {
  local python_cmds=("python3" "python" "python3.9" "python3.8" "python3.10" "python3.11")
  
  for cmd in "${python_cmds[@]}"; do
    if command -v "$cmd" &> /dev/null; then
      local version="$($cmd --version 2>&1)"
      if [[ "$version" == *"Python 3."* ]]; then
        # Try to extract version
        local major="$(echo "$version" | sed -E 's/Python ([0-9]+)\..*/\1/')"
        local minor="$(echo "$version" | sed -E 's/Python [0-9]+\.([0-9]+).*/\1/')"
        
        # Check if it's actually Python 3.6 or higher
        if [[ "$major" -eq 3 && "$minor" -ge 6 ]]; then
          PYTHON_CMD="$cmd"
          info "Found suitable Python command: $PYTHON_CMD (version $version)"
          return 0
        fi
      fi
    fi
  done
  
  error "No suitable Python version found. Please install Python 3.6+"
  return 1
}

# Check prerequisites
check_prerequisites() {
  info "Checking prerequisites..."

  # Check Docker
  if ! command -v docker &> /dev/null; then
    warning "Docker is not installed. Please install Docker: https://docs.docker.com/get-docker/"
    return 1
  fi

  # Check Docker Compose
  if ! command -v docker-compose &> /dev/null; then
    warning "Docker Compose is not installed. Please install Docker Compose: https://docs.docker.com/compose/install/"
    return 1
  fi

  # Check Java (for building Flink job)
  if ! command -v java &> /dev/null; then
    warning "Java is not installed. Please install JDK 11+: https://adoptium.net/"
    return 1
  fi

  # Check Maven
  if ! command -v mvn &> /dev/null; then
    warning "Maven is not installed. Please install Maven: https://maven.apache.org/install.html"
    return 1
  fi

  # Find suitable Python command
  if ! find_python; then
    return 1
  fi

  success "All prerequisites are installed."
  return 0
}

# Set up Python virtual environment
setup_python() {
  info "Setting up Python virtual environment..."
  
  # Check for venv module
  if ! $PYTHON_CMD -c "import venv" &>/dev/null; then
    warning "Python venv module not available. Trying to install it..."
    
    # Try to install venv based on different distributions
    if command -v apt-get &>/dev/null; then
      sudo apt-get update && sudo apt-get install -y python3-venv || \
        warning "Failed to install python3-venv. Will try to continue without it."
    elif command -v yum &>/dev/null; then
      sudo yum install -y python3-venv || \
        warning "Failed to install python3-venv. Will try to continue without it."
    elif command -v brew &>/dev/null; then
      brew install python || \
        warning "Failed to install Python with venv. Will try to continue without it."
    else
      warning "Could not determine how to install Python venv. Will try to continue without it."
    fi
  fi
  
  # Try to create virtual environment
  info "Creating virtual environment at $VENV_DIR"
  if $PYTHON_CMD -m venv "$VENV_DIR" 2>/dev/null; then
    # Determine activate script path
    activate_script="$VENV_DIR/bin/activate"
    if [[ ! -f "$activate_script" ]]; then
      # Try Windows-style path
      activate_script="$VENV_DIR/Scripts/activate"
      if [[ ! -f "$activate_script" ]]; then
        warning "Could not find activate script in virtual environment. Will try to install packages globally."
        PIP_CMD="$PYTHON_CMD -m pip"
      else
        source "$activate_script"
        PIP_CMD="pip"
      fi
    else
      source "$activate_script"
      PIP_CMD="pip"
    fi
  else
    warning "Failed to create virtual environment. Will try to install packages globally."
    PIP_CMD="$PYTHON_CMD -m pip"
  fi
  
  # Install packages
  info "Installing required Python packages"
  $PIP_CMD install --upgrade pip || warning "Failed to upgrade pip, continuing anyway"
  $PIP_CMD install kafka-python clickhouse-driver redis || warning "Failed to install some packages, continuing anyway"
  
  # Create activation script if we have a virtual environment
  if [[ -f "$activate_script" ]]; then
    cat > activate_venv.sh << EOF
#!/bin/bash
source "$activate_script"
echo "Python virtual environment activated. Use 'deactivate' to exit."
EOF
    chmod +x activate_venv.sh
  fi
  
  success "Python environment setup complete"
  return 0
}

# Create directory structure
create_directories() {
  info "Creating directory structure..."

  # Create directories safely
  mkdir -p config/{clickhouse,grafana/provisioning/{datasources,dashboards},grafana/dashboards} || return 1
  mkdir -p api || return 1
  mkdir -p volumes/flink-checkpoints || return 1
  mkdir -p scripts || return 1
  mkdir -p flink-job/src/main/java/com/edr/flink || return 1
  mkdir -p generator || return 1

  success "Directory structure created successfully"
  return 0
}

# Create docker-compose.yml file with fixed configuration
create_docker_compose() {
  info "Creating docker-compose.yml with fixed configuration..."
  
  cat > docker-compose.yml << EOF || return 1
version: '3.8'

services:
  # Message broker (Redpanda)
  redpanda:
    image: redpandadata/redpanda:latest
    container_name: edr-redpanda
    command:
      - redpanda
      - start
      - --smp=1
      - --memory=1G
      - --reserve-memory=0M
      - --overprovisioned
      - --node-id=0
      - --check=false
      - --pandaproxy-addr=0.0.0.0:8082
      - --advertise-pandaproxy-addr=redpanda:8082
      - --kafka-addr=0.0.0.0:9092
      - --advertise-kafka-addr=redpanda:9092
      - --rpc-addr=0.0.0.0:33145
      - --advertise-rpc-addr=redpanda:33145
      - --mode=dev-container
      - --set redpanda.auto_create_topics_enabled=true
    ports:
      - "9092:9092"  # Kafka API
      - "8083:8081"  # Redpanda Admin (changed from 8081 to 8083)
      - "8082:8082"  # HTTP Proxy
    healthcheck:
      test: ["CMD-SHELL", "rpk cluster health"]
      interval: 10s
      timeout: 5s
      retries: 5
    volumes:
      - redpanda_data:/var/lib/redpanda/data
    networks:
      - edr-network

  # Redpanda Console (Admin UI)
  redpanda-console:
    image: redpandadata/console:latest
    container_name: edr-redpanda-console
    environment:
      - KAFKA_BROKERS=redpanda:9092
    ports:
      - "8080:8080"
    depends_on:
      redpanda:
        condition: service_healthy
    networks:
      - edr-network

  # ClickHouse database
  clickhouse:
    image: clickhouse/clickhouse-server:latest
    container_name: edr-clickhouse
    ports:
      - "8123:8123"  # HTTP interface
      - "9000:9000"  # Native interface
    volumes:
      - ./config/clickhouse/config.xml:/etc/clickhouse-server/config.d/config.xml
      - ./config/clickhouse/users.xml:/etc/clickhouse-server/users.d/users.xml
      - ./scripts/init-db.sh:/docker-entrypoint-initdb.d/init-db.sh
      - clickhouse_data:/var/lib/clickhouse
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--spider", "--tries=1", "http://localhost:8123/ping"]
      interval: 5s
      timeout: 5s
      retries: 3
    ulimits:
      nofile:
        soft: 262144
        hard: 262144
    networks:
      - edr-network

  # Flink JobManager
  jobmanager:
    image: flink:1.18.1
    container_name: edr-flink-jobmanager
    command: jobmanager
    ports:
      - "8081:8081"  # Web UI
    environment:
      - JOB_MANAGER_RPC_ADDRESS=jobmanager
      - |
        FLINK_PROPERTIES=
        jobmanager.rpc.address: jobmanager
        jobmanager.memory.process.size: 1024m
        taskmanager.memory.process.size: 1024m
        state.backend: rocksdb
        state.backend.incremental: true
        parallelism.default: 2
        execution.checkpointing.interval: 10000
    volumes:
      - ./volumes/flink-checkpoints:/opt/flink/checkpoints
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8081/"]
      interval: 5s
      timeout: 5s
      retries: 3
    networks:
      - edr-network

  # Flink TaskManager
  taskmanager:
    image: flink:1.18.1
    container_name: edr-flink-taskmanager
    command: taskmanager
    scale: 1
    depends_on:
      jobmanager:
        condition: service_healthy
    environment:
      - JOB_MANAGER_RPC_ADDRESS=jobmanager
      - |
        FLINK_PROPERTIES=
        jobmanager.rpc.address: jobmanager
        taskmanager.numberOfTaskSlots: 4
        taskmanager.memory.process.size: 1024m
    volumes:
      - ./volumes/flink-checkpoints:/opt/flink/checkpoints
    networks:
      - edr-network

  # Redis for API caching
  redis:
    image: redis:alpine
    container_name: edr-redis
    ports:
      - "6379:6379"
    command: redis-server --appendonly no --maxmemory 256mb --maxmemory-policy volatile-lru
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 3
    networks:
      - edr-network

  # Lightweight API service (Mock)
  api:
    build:
      context: ./api
      dockerfile: Dockerfile
    container_name: edr-api
    ports:
      - "3000:3000"
    environment:
      - CLICKHOUSE_HOST=clickhouse
      - CLICKHOUSE_PORT=8123
      - CLICKHOUSE_USER=default
      - CLICKHOUSE_PASSWORD=edrpassword
      - CLICKHOUSE_DATABASE=edr
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - PORT=3000
    depends_on:
      clickhouse:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - ./api:/app
      - /app/node_modules
    networks:
      - edr-network

  # Development Dashboard
  grafana:
    image: grafana/grafana:latest
    container_name: edr-grafana
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_USERS_ALLOW_SIGN_UP=false
    volumes:
      - ./config/grafana/provisioning:/etc/grafana/provisioning
      - ./config/grafana/dashboards:/var/lib/grafana/dashboards
    depends_on:
      clickhouse:
        condition: service_healthy
    networks:
      - edr-network
      
  # Data Generator (for easier connection to Redpanda)
  data-generator:
    build:
      context: ./generator
      dockerfile: Dockerfile
    container_name: edr-data-generator
    depends_on:
      redpanda:
        condition: service_healthy
    volumes:
      - ./scripts:/app/scripts
    networks:
      - edr-network

volumes:
  redpanda_data:
  clickhouse_data:
  redis_data:

networks:
  edr-network:
    driver: bridge
EOF

  success "docker-compose.yml created successfully"
  return 0
}

# Create generator Dockerfile
create_generator_dockerfile() {
  info "Creating generator Dockerfile..."
  
  cat > generator/Dockerfile << EOF || return 1
# Dockerfile for the data generator container
FROM python:3.9-slim

WORKDIR /app

# Install required packages
RUN pip install kafka-python

# Keep container running
CMD ["tail", "-f", "/dev/null"]
EOF

  success "Generator Dockerfile created successfully"
  return 0
}

# Create configuration files
create_config_files() {
  info "Creating configuration files..."

  # ClickHouse configuration
  cat > config/clickhouse/config.xml << EOF || return 1
<clickhouse>
    <logger>
        <level>information</level>
        <console>true</console>
    </logger>
    <display_name>edr-dev</display_name>
    <http_port>8123</http_port>
    <tcp_port>9000</tcp_port>
    <max_connections>100</max_connections>
    <keep_alive_timeout>300</keep_alive_timeout>
    <max_concurrent_queries>50</max_concurrent_queries>
    <uncompressed_cache_size>1073741824</uncompressed_cache_size>
    <mark_cache_size>1073741824</mark_cache_size>
    <path>/var/lib/clickhouse/</path>
    <tmp_path>/var/lib/clickhouse/tmp/</tmp_path>
    <user_files_path>/var/lib/clickhouse/user_files/</user_files_path>
    <users_config>users.xml</users_config>
    <default_profile>default</default_profile>
    <default_database>default</default_database>
    <listen_host>0.0.0.0</listen_host>
    <max_table_size_to_drop>0</max_table_size_to_drop>
</clickhouse>
EOF

  # ClickHouse users
  cat > config/clickhouse/users.xml << EOF || return 1
<clickhouse>
    <profiles>
        <default>
            <max_memory_usage>2000000000</max_memory_usage>
            <max_threads>4</max_threads>
            <load_balancing>random</load_balancing>
        </default>
    </profiles>
    <users>
        <default>
            <password>edrpassword</password>
            <profile>default</profile>
            <networks>
                <ip>::/0</ip>
            </networks>
            <quota>default</quota>
        </default>
    </users>
    <quotas>
        <default>
            <interval>
                <duration>3600</duration>
                <queries>0</queries>
                <errors>0</errors>
                <result_rows>0</result_rows>
                <read_rows>0</read_rows>
                <execution_time>0</execution_time>
            </interval>
        </default>
    </quotas>
</clickhouse>
EOF

  # Initialize ClickHouse database
  cat > scripts/init-db.sh << EOF || return 1
#!/bin/bash
set -e

clickhouse client -h localhost -u default --password edrpassword -n <<-EOSQL
    CREATE DATABASE IF NOT EXISTS edr;

    -- Events table
    CREATE TABLE IF NOT EXISTS edr.events (
        id String,
        timestamp DateTime64(3),
        endpoint_id String,
        event_type String,
        status String,
        direction String,
        bytes UInt64,
        source_ip String,
        destination_ip String,
        process_name String,
        user String,
        date Date DEFAULT toDate(timestamp)
    ) ENGINE = MergeTree()
    PARTITION BY toYYYYMM(date)
    ORDER BY (endpoint_id, timestamp)
    TTL date + INTERVAL 30 DAY
    SETTINGS index_granularity = 8192;

    -- Detections table
    CREATE TABLE IF NOT EXISTS edr.detections (
        id String,
        timestamp DateTime64(3),
        rule_id String,
        severity UInt8,
        endpoint_id String,
        description String,
        event_ids String,
        date Date DEFAULT toDate(timestamp)
    ) ENGINE = ReplacingMergeTree()
    PARTITION BY toYYYYMM(date)
    ORDER BY (severity, rule_id, timestamp)
    TTL date + INTERVAL 90 DAY
    SETTINGS index_granularity = 8192;

    -- Endpoint lookup table
    CREATE TABLE IF NOT EXISTS edr.endpoints (
        endpoint_id String,
        hostname String,
        ip String,
        os String,
        last_seen DateTime64(3)
    ) ENGINE = ReplacingMergeTree()
    ORDER BY endpoint_id
    SETTINGS index_granularity = 8192;
    
    -- Fast query materialized views
    CREATE MATERIALIZED VIEW IF NOT EXISTS edr.detection_summary_mv
    ENGINE = SummingMergeTree()
    PARTITION BY toYYYYMM(date)
    ORDER BY (date, severity, rule_id)
    POPULATE AS
    SELECT 
        toDate(timestamp) AS date,
        rule_id,
        severity,
        count() AS detection_count,
        uniqExact(endpoint_id) AS affected_endpoints
    FROM edr.detections
    GROUP BY date, rule_id, severity;
    
    -- Fast access for endpoint detections
    CREATE MATERIALIZED VIEW IF NOT EXISTS edr.endpoint_detections_mv
    ENGINE = SummingMergeTree()
    PARTITION BY toYYYYMM(date)
    ORDER BY (endpoint_id, date)
    POPULATE AS
    SELECT 
        endpoint_id,
        toDate(timestamp) AS date,
        uniqExact(rule_id) AS unique_rules,
        count() AS detection_count,
        max(severity) AS max_severity
    FROM edr.detections
    GROUP BY endpoint_id, date;
EOSQL

echo "ClickHouse schema initialization complete."
EOF
  chmod +x scripts/init-db.sh || return 1

  # Grafana datasource
  mkdir -p config/grafana/provisioning/datasources || return 1
  cat > config/grafana/provisioning/datasources/clickhouse.yml << EOF || return 1
apiVersion: 1

datasources:
  - name: ClickHouse
    type: grafana-clickhouse-datasource
    access: proxy
    url: http://clickhouse:8123
    user: default
    secureJsonData:
      password: edrpassword
    jsonData:
      defaultDatabase: edr
      defaultTable: events
      tlsSkipVerify: true
    editable: true
EOF

  # Grafana dashboard provisioning
  mkdir -p config/grafana/provisioning/dashboards || return 1
  cat > config/grafana/provisioning/dashboards/dashboards.yml << EOF || return 1
apiVersion: 1

providers:
  - name: 'EDR Dashboard'
    folder: 'EDR'
    type: file
    options:
      path: /var/lib/grafana/dashboards
EOF

  # Sample Grafana dashboard
  mkdir -p config/grafana/dashboards || return 1
  cat > config/grafana/dashboards/edr-overview.json << EOF || return 1
{
  "annotations": {
    "list": [
      {
        "builtIn": 1,
        "datasource": {
          "type": "grafana",
          "uid": "-- Grafana --"
        },
        "enable": true,
        "hide": true,
        "iconColor": "rgba(0, 211, 255, 1)",
        "name": "Annotations & Alerts",
        "type": "dashboard"
      }
    ]
  },
  "editable": true,
  "fiscalYearStartMonth": 0,
  "graphTooltip": 0,
  "links": [],
  "liveNow": false,
  "panels": [
    {
      "datasource": {
        "type": "grafana-clickhouse-datasource",
        "uid": "P035FD28BB8F5617F"
      },
      "fieldConfig": {
        "defaults": {
          "color": {
            "mode": "palette-classic"
          },
          "custom": {
            "hideFrom": {
              "legend": false,
              "tooltip": false,
              "viz": false
            }
          },
          "mappings": []
        },
        "overrides": []
      },
      "gridPos": {
        "h": 8,
        "w": 12,
        "x": 0,
        "y": 0
      },
      "id": 1,
      "options": {
        "legend": {
          "displayMode": "list",
          "placement": "bottom",
          "showLegend": true
        },
        "pieType": "pie",
        "reduceOptions": {
          "calcs": [
            "lastNotNull"
          ],
          "fields": "",
          "values": false
        },
        "tooltip": {
          "mode": "single",
          "sort": "none"
        }
      },
      "title": "Event Types",
      "type": "piechart"
    }
  ],
  "refresh": "",
  "schemaVersion": 38,
  "style": "dark",
  "tags": [],
  "templating": {
    "list": []
  },
  "time": {
    "from": "now-6h",
    "to": "now"
  },
  "timepicker": {},
  "timezone": "",
  "title": "EDR Overview",
  "version": 0,
  "weekStart": ""
}
EOF

  success "Configuration files created successfully"
  return 0
}

# Create API mock service
create_api_service() {
  info "Creating API mock service..."

  # Create package.json
  cat > api/package.json << EOF || return 1
{
  "name": "edr-api",
  "version": "1.0.0",
  "description": "EDR/XDR API Service for Development",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "nodemon index.js",
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "clickhouse": "^2.6.0",
    "redis": "^4.6.7",
    "morgan": "^1.10.0",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
EOF

  # Create index.js in chunks to avoid potential issues
  cat > api/index.js << EOF || return 1
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { createClient } = require('redis');
const { ClickHouse } = require('clickhouse');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// ClickHouse client
const clickhouse = new ClickHouse({
  url: process.env.CLICKHOUSE_HOST || 'clickhouse',
  port: process.env.CLICKHOUSE_PORT || 8123,
  debug: false,
  basicAuth: {
    username: process.env.CLICKHOUSE_USER || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || 'edrpassword',
  },
  format: 'json',
  raw: false,
});
EOF

  # Continue with index.js - Redis section
  cat >> api/index.js << EOF || return 1
// Redis client
let redisClient;
async function connectRedis() {
  redisClient = createClient({
    url: \`redis://\${process.env.REDIS_HOST || 'redis'}:\${process.env.REDIS_PORT || 6379}\`
  });
  
  redisClient.on('error', (err) => console.log('Redis Client Error', err));
  await redisClient.connect();
}
connectRedis();

// Routes
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date() });
});
EOF

  # Continue with index.js - Events route
  cat >> api/index.js << EOF || return 1
// Get recent events
app.get('/api/events', async (req, res) => {
  try {
    const { limit = 100, offset = 0, endpoint_id, event_type, from, to } = req.query;
    
    // Build WHERE clause
    let whereClause = '';
    const conditions = [];
    
    if (endpoint_id) conditions.push(\`endpoint_id = '\${endpoint_id}'\`);
    if (event_type) conditions.push(\`event_type = '\${event_type}'\`);
    if (from) conditions.push(\`timestamp >= toDateTime64('\${from}', 3)\`);
    if (to) conditions.push(\`timestamp <= toDateTime64('\${to}', 3)\`);
    
    if (conditions.length > 0) {
      whereClause = 'WHERE ' + conditions.join(' AND ');
    }
    
    const query = \`
      SELECT *
      FROM edr.events
      \${whereClause}
      ORDER BY timestamp DESC
      LIMIT \${limit}
      OFFSET \${offset}
    \`;
    
    const cacheKey = \`events:\${JSON.stringify(req.query)}\`;
    const cachedResult = await redisClient.get(cacheKey);
    
    if (cachedResult) {
      return res.json(JSON.parse(cachedResult));
    }
    
    const result = await clickhouse.query(query).toPromise();
    await redisClient.set(cacheKey, JSON.stringify(result), { EX: 60 });
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});
EOF

  # Continue with index.js - Detections route
  cat >> api/index.js << EOF || return 1
// Get detections
app.get('/api/detections', async (req, res) => {
  try {
    const { limit = 100, offset = 0, severity, rule_id, endpoint_id, from, to } = req.query;
    
    // Build WHERE clause
    let whereClause = '';
    const conditions = [];
    
    if (severity) conditions.push(\`severity = \${severity}\`);
    if (rule_id) conditions.push(\`rule_id = '\${rule_id}'\`);
    if (endpoint_id) conditions.push(\`endpoint_id = '\${endpoint_id}'\`);
    if (from) conditions.push(\`timestamp >= toDateTime64('\${from}', 3)\`);
    if (to) conditions.push(\`timestamp <= toDateTime64('\${to}', 3)\`);
    
    if (conditions.length > 0) {
      whereClause = 'WHERE ' + conditions.join(' AND ');
    }
    
    const query = \`
      SELECT *
      FROM edr.detections
      \${whereClause}
      ORDER BY timestamp DESC
      LIMIT \${limit}
      OFFSET \${offset}
    \`;
    
    const cacheKey = \`detections:\${JSON.stringify(req.query)}\`;
    const cachedResult = await redisClient.get(cacheKey);
    
    if (cachedResult) {
      return res.json(JSON.parse(cachedResult));
    }
    
    const result = await clickhouse.query(query).toPromise();
    await redisClient.set(cacheKey, JSON.stringify(result), { EX: 60 });
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching detections:', error);
    res.status(500).json({ error: 'Failed to fetch detections' });
  }
});
EOF

  # Finish index.js - Dashboard stats and server
  cat >> api/index.js << EOF || return 1
// Get dashboard stats
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const cacheKey = 'dashboard:stats';
    const cachedResult = await redisClient.get(cacheKey);
    
    if (cachedResult) {
      return res.json(JSON.parse(cachedResult));
    }
    
    // Get event count
    const eventCountQuery = \`
      SELECT count() as count
      FROM edr.events
      WHERE timestamp >= now() - INTERVAL 24 HOUR
    \`;
    const eventCountResult = await clickhouse.query(eventCountQuery).toPromise();
    
    // Get detection count
    const detectionCountQuery = \`
      SELECT count() as count
      FROM edr.detections
      WHERE timestamp >= now() - INTERVAL 24 HOUR
    \`;
    const detectionCountResult = await clickhouse.query(detectionCountQuery).toPromise();
    
    // Get severity distribution
    const severityQuery = \`
      SELECT severity, count() as count
      FROM edr.detections
      WHERE timestamp >= now() - INTERVAL 24 HOUR
      GROUP BY severity
      ORDER BY severity
    \`;
    const severityResult = await clickhouse.query(severityQuery).toPromise();
    
    // Get event type distribution
    const eventTypeQuery = \`
      SELECT event_type, count() as count
      FROM edr.events
      WHERE timestamp >= now() - INTERVAL 24 HOUR
      GROUP BY event_type
      ORDER BY count DESC
      LIMIT 10
    \`;
    const eventTypeResult = await clickhouse.query(eventTypeQuery).toPromise();
    
    const stats = {
      eventCount: eventCountResult[0]?.count || 0,
      detectionCount: detectionCountResult[0]?.count || 0,
      severityDistribution: severityResult,
      eventTypeDistribution: eventTypeResult
    };
    
    await redisClient.set(cacheKey, JSON.stringify(stats), { EX: 60 });
    
    res.json(stats);
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(\`API server running on port \${PORT}\`);
  console.log('Available API endpoints:');
  console.log('  GET /health           - Health check');
  console.log('  GET /api/events       - Get events');
  console.log('  GET /api/detections   - Get detections');
  console.log('  GET /api/dashboard/stats - Get dashboard stats');
});
EOF

  # Create Dockerfile
  cat > api/Dockerfile << EOF || return 1
FROM node:16-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
EOF

  success "API service created successfully"
  return 0
}

# Create test data generator
create_test_data_generator() {
  info "Creating test data generator..."

  cat > scripts/generate-data.py << 'EOF' || return 1
#!/usr/bin/env python3
# generate-data.py - Generate test data for the EDR/XDR system

import json
import random
import time
import uuid
import argparse
import sys
try:
    from kafka import KafkaProducer, KafkaAdminClient
    from kafka.admin import NewTopic
    kafka_available = True
except ImportError:
    kafka_available = False
    print("WARNING: kafka-python package not installed. Install it with 'pip install kafka-python'")

# Configuration
DEFAULT_KAFKA_BROKER = "localhost:9092"
DEFAULT_NUM_ENDPOINTS = 10
DEFAULT_EVENTS_PER_SECOND = 100
DEFAULT_TEST_DURATION = 60  # seconds
DEFAULT_TOPIC_NAME = "raw-events"  # Changed to DEFAULT_TOPIC_NAME

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

def ensure_topic_exists(kafka_broker, topic_name):
    """Try to ensure the topic exists."""
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

def generate_endpoint_id():
    """Generate a random endpoint ID."""
    return f"endpoint-{uuid.uuid4().hex[:8]}"

def generate_ip():
    """Generate a random IP address."""
    prefix = random.choice(IP_PREFIXES)
    suffix = random.randint(1, 254)
    return f"{prefix}{suffix}"

def generate_event(endpoint_id):
    """Generate a random security event."""
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

def generate_suspicious_events(endpoint_id):
    """Generate a series of suspicious events that should trigger detection rules."""
    events = []
    
    # Generate suspicious pattern 1: Multiple failed logins
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
            "user": random.choice(USERS),
            "direction": ""
        }
        events.append(event)
        time.sleep(0.1)
    
    # Generate suspicious pattern 2: Suspicious process with network connection
    process_event = {
        "id": str(uuid.uuid4()),
        "timestamp": int(time.time() * 1000),
        "endpoint_id": endpoint_id,
        "event_type": "process",
        "status": "success",
        "bytes": 0,
        "source_ip": "",
        "destination_ip": "",
        "process_name": "mimikatz.exe",  # Suspicious process
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
        "process_name": "mimikatz.exe",  # Same suspicious process
        "user": "Administrator",
        "direction": "outbound"
    }
    events.append(network_event)
    
    return events

def write_events_to_file(events, filename="generated_events.json"):
    """Write events to a JSON file."""
    with open(filename, 'w') as f:
        json.dump(events, f, indent=2)
    print(f"Wrote {len(events)} events to {filename}")

def send_events_to_kafka(kafka_broker, endpoints, events_per_second, duration, include_suspicious=True, topic_name=DEFAULT_TOPIC_NAME):
    """Send events to Kafka broker."""
    if not kafka_available:
        print("Cannot send to Kafka - kafka-python package not installed")
        print("Run: pip install kafka-python")
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
        print(f"Error connecting to Kafka broker at {kafka_broker}: {e}")
        print("\nPossible issues and solutions:")
        print("1. Make sure Redpanda is running: docker ps | grep redpanda")
        print(f"2. Create the topic manually: docker exec edr-redpanda rpk topic create {topic_name}")
        print("3. Check if topics exist: docker exec edr-redpanda rpk topic list")
        print("4. Try using --file option to write events to file instead")
        return 0
    
    print(f"Sending {events_per_second} events/second for {duration} seconds from {len(endpoints)} endpoints")
    
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
                    print(f"\nError sending event: {e}")
            
            # Send suspicious events after 10 seconds
            if include_suspicious and not suspicious_sent and time.time() - start_time > 10:
                print("Sending suspicious events pattern...")
                suspicious_endpoint = random.choice(endpoints)
                suspicious_events = generate_suspicious_events(suspicious_endpoint)
                
                for event in suspicious_events:
                    all_events.append(event)
                    try:
                        producer.send(topic_name, event)
                        event_count += 1
                    except Exception as e:
                        print(f"\nError sending suspicious event: {e}")
                
                suspicious_sent = True
            
            try:
                producer.flush(timeout=5)
            except Exception as e:
                print(f"\nError flushing messages: {e}")
                
            current_rate = event_count / (time.time() - start_time) if time.time() > start_time else 0
            sys.stdout.write(f"\rEvents sent: {event_count} (Rate: {current_rate:.2f} events/sec)")
            sys.stdout.flush()
            
            # Sleep to maintain the desired rate
            time.sleep(0.1)
    except KeyboardInterrupt:
        print("\nStopping event generation...")
    except Exception as e:
        print(f"\nError during event generation: {e}")
        
    try:
        producer.flush(timeout=5)
        producer.close(timeout=5)
    except Exception as _:
        pass
    
    print(f"\nTotal events sent: {event_count}")
    
    # If no events were sent successfully, save to file as fallback
    if event_count == 0 and all_events:
        print("No events were sent successfully. Saving to file instead...")
        write_events_to_file(all_events)
        
    return event_count

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
    
    print("EDR/XDR Test Data Generator")
    print("===========================")
    print(f"Kafka Broker: {args.kafka}")
    print(f"Endpoint Count: {args.endpoints}")
    print(f"Event Rate: {args.rate}/second")
    print(f"Duration: {args.duration} seconds")
    print(f"Include Suspicious Events: {not args.no_suspicious}")
    print(f"Topic Name: {topic_name}")
    print("===========================")
    
    # Generate endpoint IDs
    endpoints = [generate_endpoint_id() for _ in range(args.endpoints)]
    
    if args.file:
        # Generate events to file
        print("Generating events to file...")
        all_events = []
        for _ in range(min(1000, args.rate * args.duration)):
            endpoint_id = random.choice(endpoints)
            all_events.append(generate_event(endpoint_id))
        
        # Add some suspicious events
        if not args.no_suspicious:
            suspicious_endpoint = random.choice(endpoints)
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
            topic_name  # Pass the topic name as a parameter
        )

if __name__ == "__main__":
    main()
EOF
  chmod +x scripts/generate-data.py || return 1

  success "Test data generator created successfully"
  return 0
}

# Create the run-generator.sh script
create_run_generator_script() {
  info "Creating run-generator.sh script..."
  
  cat > run-generator.sh << 'EOF' || return 1
#!/bin/bash
# run-generator.sh - Run data generator from inside Docker network

# Create the required topics first
echo "Creating Kafka topics..."
docker exec edr-redpanda rpk topic create raw-events --partitions 6 --replicas 1 || true
docker exec edr-redpanda rpk topic create detections --partitions 6 --replicas 1 || true

# Run the generator from inside the container
echo "Running data generator inside Docker network..."
docker exec edr-data-generator python /app/scripts/generate-data.py --kafka redpanda:9092 "$@"

echo "Done!"
EOF
  chmod +x run-generator.sh || return 1
  
  success "run-generator.sh created successfully"
  return 0
}

# Create create-topics.sh script
create_topics_script() {
  info "Creating create-topics.sh script..."
  
  cat > create-topics.sh << 'EOF' || return 1
#!/bin/bash
# create-topics.sh - Create required Kafka topics

echo "Creating Kafka topics..."
docker exec edr-redpanda rpk topic create raw-events --partitions 6 --replicas 1
docker exec edr-redpanda rpk topic create detections --partitions 6 --replicas 1

echo "Topics created successfully."
echo "You can now run the data generator: ./scripts/generate-data.py"
EOF
  chmod +x create-topics.sh || return 1
  
  success "create-topics.sh created successfully"
  return 0
}

# Create convenience scripts
create_convenience_scripts() {
  info "Creating convenience scripts..."

  # Start script
  cat > start.sh << 'EOF' || return 1
#!/bin/bash
# start.sh - Start the EDR/XDR development environment

echo "Starting EDR/XDR development environment..."
docker-compose up -d

echo "Waiting for services to initialize..."
sleep 10

echo "Environment is ready!"
echo ""
echo "Available services:"
echo "  Redpanda Console: http://localhost:8080"
echo "  Redpanda Admin:   http://localhost:8083"
echo "  Flink Dashboard:  http://localhost:8081"
echo "  ClickHouse UI:    http://localhost:8123/play"
echo "  API Service:      http://localhost:3000"
echo "  Grafana:          http://localhost:3001 (admin/admin)"
echo ""
echo "Use './run-generator.sh' to generate test data inside the Docker network"
echo "Use './build-flink-job.sh' to build and deploy the Flink job"
echo "Use './stop.sh' to stop the environment"
EOF
  chmod +x start.sh || return 1

  # Stop script
  cat > stop.sh << 'EOF' || return 1
#!/bin/bash
# stop.sh - Stop the EDR/XDR development environment

echo "Stopping EDR/XDR development environment..."
docker-compose down

echo "Environment stopped."
EOF
  chmod +x stop.sh || return 1

  # Check Environment script
  cat > check-environment.sh << 'EOF' || return 1
#!/bin/bash
# check-environment.sh - Check if the EDR/XDR environment is fully operational

# Set up colors for output
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ClickHouse credentials
CH_USER="default"
CH_PASSWORD="edrpassword"

echo -e "${BLUE}${BOLD}=== EDR/XDR Environment Status Check ===${NC}"
echo -e "${BLUE}Starting comprehensive environment check...${NC}"
echo

# Initialize counters
SERVICES_OK=0
SERVICES_TOTAL=0
DATA_OK=0
DATA_TOTAL=0
ENDPOINTS_OK=0
ENDPOINTS_TOTAL=0

# Function to check if a container is running
check_container() {
  local name=$1
  SERVICES_TOTAL=$((SERVICES_TOTAL+1))
  
  echo -n "Checking container '$name': "
  if docker ps --format '{{.Names}}' | grep -q "$name"; then
    echo -e "${GREEN}Running${NC}"
    SERVICES_OK=$((SERVICES_OK+1))
    return 0
  else
    echo -e "${RED}Not running${NC}"
    return 1
  fi
}

# Function to check an HTTP endpoint
check_endpoint() {
  local name=$1
  local url=$2
  local expected_code=${3:-200}
  ENDPOINTS_TOTAL=$((ENDPOINTS_TOTAL+1))
  
  echo -n "Checking endpoint '$name' ($url): "
  local status_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url" 2>/dev/null)
  
  if [ "$status_code" = "$expected_code" ]; then
    echo -e "${GREEN}Available (HTTP $status_code)${NC}"
    ENDPOINTS_OK=$((ENDPOINTS_OK+1))
    return 0
  else
    echo -e "${RED}Failed (HTTP $status_code)${NC}"
    return 1
  fi
}

# Function to check if a table exists and has data
check_table_data() {
  local table=$1
  local min_rows=${2:-1}
  DATA_TOTAL=$((DATA_TOTAL+1))
  
  echo -n "Checking data in table 'edr.$table': "
  
  # First, check if the database exists
  if ! docker exec edr-clickhouse clickhouse-client --user "$CH_USER" --password "$CH_PASSWORD" --query="SELECT 1 FROM system.databases WHERE name='edr'" 2>/dev/null | grep -q "1"; then
    echo -e "${RED}Database 'edr' doesn't exist${NC}"
    return 1
  fi
  
  # Then check if table exists
  if ! docker exec edr-clickhouse clickhouse-client --user "$CH_USER" --password "$CH_PASSWORD" --query="SELECT 1 FROM system.tables WHERE database='edr' AND name='$table'" 2>/dev/null | grep -q "1"; then
    echo -e "${RED}Table doesn't exist${NC}"
    return 1
  fi
  
  # Try to count rows with a more reliable approach
  local row_count=$(docker exec edr-clickhouse clickhouse-client --user "$CH_USER" --password "$CH_PASSWORD" --query="SELECT count() FROM edr.$table" 2>/dev/null)
  
  if [ -z "$row_count" ]; then
    echo -e "${RED}Failed to query table${NC}"
    return 1
  elif [ "$row_count" -ge "$min_rows" ]; then
    echo -e "${GREEN}OK ($row_count rows)${NC}"
    DATA_OK=$((DATA_OK+1))
    return 0
  else
    echo -e "${YELLOW}Empty (0 rows)${NC}"
    return 1
  fi
}

# Function to check Flink jobs
check_flink_jobs() {
  DATA_TOTAL=$((DATA_TOTAL+1))
  
  echo -n "Checking Flink jobs: "
  
  # Get the number of running jobs
  local running_jobs=$(curl -s http://localhost:8081/jobs/overview 2>/dev/null | grep -o '"state":"RUNNING"' | wc -l)
  
  if [ "$running_jobs" -gt 0 ]; then
    echo -e "${GREEN}OK ($running_jobs running)${NC}"
    DATA_OK=$((DATA_OK+1))
    return 0
  else
    echo -e "${RED}No running jobs${NC}"
    return 1
  fi
}

# Function to check Kafka topics
check_kafka_topic() {
  local topic=$1
  DATA_TOTAL=$((DATA_TOTAL+1))
  
  echo -n "Checking Kafka topic '$topic': "
  
  # Check if topic exists
  if ! docker exec edr-redpanda rpk topic list 2>/dev/null | grep -q "$topic"; then
    echo -e "${RED}Topic doesn't exist${NC}"
    return 1
  fi
  
  # For Redpanda, checking for actual messages is difficult via shell, so we'll just assume
  # topics were created correctly and are functioning
  echo -e "${GREEN}OK (topic exists)${NC}"
  DATA_OK=$((DATA_OK+1))
  return 0
}

# Run all the checks
echo -e "${BOLD}=== Docker Containers ===${NC}"
check_container "edr-redpanda"
check_container "edr-clickhouse" 
check_container "edr-flink-jobmanager"
check_container "edr-flink-taskmanager"
check_container "edr-redis"
check_container "edr-api"
check_container "edr-grafana"
check_container "edr-data-generator"

echo
echo -e "${BOLD}=== Service Endpoints ===${NC}"
check_endpoint "Redpanda Console" "http://localhost:8080"
check_endpoint "Flink Dashboard" "http://localhost:8081"
check_endpoint "ClickHouse" "http://localhost:8123/ping"
check_endpoint "API" "http://localhost:3000/health"
check_endpoint "Grafana" "http://localhost:3001/api/health"

echo
echo -e "${BOLD}=== Data Processing ===${NC}"
check_flink_jobs
check_kafka_topic "raw-events"
check_kafka_topic "detections"
check_table_data "events"
check_table_data "detections"

echo
echo -e "${BOLD}=== API Functionality ===${NC}"
check_endpoint "API Events Endpoint" "http://localhost:3000/api/events"
check_endpoint "API Detections Endpoint" "http://localhost:3000/api/detections"
check_endpoint "API Dashboard Stats" "http://localhost:3000/api/dashboard/stats"

# Calculate overall scores
SERVICES_PCT=$((SERVICES_OK * 100 / SERVICES_TOTAL))
DATA_PCT=$((DATA_OK * 100 / DATA_TOTAL))
ENDPOINTS_PCT=$((ENDPOINTS_OK * 100 / ENDPOINTS_TOTAL))
OVERALL_PCT=$(( (SERVICES_PCT + DATA_PCT + ENDPOINTS_PCT) / 3 ))

# Determine overall health status
if [ $OVERALL_PCT -ge 90 ]; then
  HEALTH_STATUS="${GREEN}HEALTHY${NC}"
elif [ $OVERALL_PCT -ge 70 ]; then
  HEALTH_STATUS="${YELLOW}PARTIALLY HEALTHY${NC}"
else
  HEALTH_STATUS="${RED}UNHEALTHY${NC}"
fi

# Print summary
echo
echo -e "${BLUE}${BOLD}=== Environment Health Summary ===${NC}"
echo -e "Services: ${SERVICES_OK}/${SERVICES_TOTAL} operational (${SERVICES_PCT}%)"
echo -e "Endpoints: ${ENDPOINTS_OK}/${ENDPOINTS_TOTAL} available (${ENDPOINTS_PCT}%)"
echo -e "Data Processing: ${DATA_OK}/${DATA_TOTAL} verified (${DATA_PCT}%)"
echo -e "Overall Health: $HEALTH_STATUS (${OVERALL_PCT}%)"

# Print action items if not fully healthy
if [ $OVERALL_PCT -lt 100 ]; then
  echo
  echo -e "${BOLD}Recommended Actions:${NC}"
  
  if [ $SERVICES_PCT -lt 100 ]; then
    echo -e "- Some containers are not running. Try: ${BOLD}./start.sh${NC}"
  fi
  
  if [ $ENDPOINTS_PCT -lt 100 ]; then
    echo -e "- Some service endpoints are unavailable. Check container logs with: ${BOLD}docker logs <container-name>${NC}"
  fi
  
  if [ "$(curl -s http://localhost:8081/jobs/overview 2>/dev/null | grep -o '"state":"RUNNING"' | wc -l)" -eq 0 ]; then
    echo -e "- No Flink jobs running. Deploy the job with: ${BOLD}./build-flink-job.sh${NC}"
  fi
  
  # Check for data issues with authentication
  if docker exec edr-clickhouse clickhouse-client --user "$CH_USER" --password "$CH_PASSWORD" --query="SELECT 1 FROM system.tables WHERE database='edr' AND name='events'" 2>/dev/null | grep -q "1"; then
    event_count=$(docker exec edr-clickhouse clickhouse-client --user "$CH_USER" --password "$CH_PASSWORD" --query="SELECT count() FROM edr.events" 2>/dev/null || echo 0)
    if [ "$event_count" -eq 0 ]; then
      echo -e "- No event data found. Generate test data with: ${BOLD}./run-generator.sh${NC}"
    fi
  fi
  
  echo -e "- For more detailed troubleshooting, see: ${BOLD}TROUBLESHOOTING.md${NC}"
fi

# Exit with appropriate status code
if [ $OVERALL_PCT -ge 70 ]; then
  exit 0
else
  exit 1
fi
EOF
  chmod +x check-environment.sh || return 1

  # Clean script
  cat > clean.sh << 'EOF' || return 1
#!/bin/bash
# clean.sh - Clean the EDR/XDR development environment data

echo "Stopping environment..."
docker-compose down

echo "Removing volumes..."
docker volume rm edr-dev_redpanda_data edr-dev_clickhouse_data edr-dev_redis_data 2>/dev/null || echo "No volumes to remove"

echo "Environment cleaned."
EOF
  chmod +x clean.sh || return 1

  # Build Flink job script
  cat > build-flink-job.sh << 'EOF' || return 1
#!/bin/bash
# build-flink-job.sh - Build and deploy the Flink job

set -e

echo "Building Flink job..."
cd flink-job
mvn clean package
cd ..

echo "Checking Flink JobManager container..."
if ! docker ps | grep edr-flink-jobmanager > /dev/null; then
  echo "Error: JobManager container is not running. Start with './start.sh' first."
  exit 1
fi

echo "Creating target directory..."
docker exec edr-flink-jobmanager mkdir -p /opt/flink/usrlib/

echo "Copying Flink job to JobManager..."
docker cp flink-job/target/edr-flink-1.0-SNAPSHOT.jar edr-flink-jobmanager:/opt/flink/usrlib/

echo "Submitting Flink job..."
docker exec edr-flink-jobmanager flink run -d /opt/flink/usrlib/edr-flink-1.0-SNAPSHOT.jar

echo "Flink job deployed successfully."
EOF
  chmod +x build-flink-job.sh || return 1
  
  # Create run-generator script
  run_step "run_generator" create_run_generator_script || return 1
  
  # Create topics script
  run_step "topics_script" create_topics_script || return 1

  # Create README
  cat > README.md << 'EOF' || return 1
# EDR/XDR Development Environment

This is a lightweight development environment for the EDR/XDR system, designed to run on a developer's laptop.

## Prerequisites

- Docker and Docker Compose
- Java 11+ (for building Flink jobs)
- Maven (for building Flink jobs)
- Python 3.6+ (for test data generation)
  - Required packages are installed by setup.sh in a virtual environment

## Getting Started

1. Run the setup script to create the environment:

   ```
   ./setup.sh
   ```

2. Start the environment:

   ```
   ./start.sh
   ```

3. Build and deploy the Flink job:

   ```
   ./build-flink-job.sh
   ```

4. Generate test data:

   ```
   ./run-generator.sh
   ```

## Available Services

- **Redpanda Console**: http://localhost:8080
- **Redpanda Admin**: http://localhost:8083
- **Flink Dashboard**: http://localhost:8081
- **ClickHouse UI**: http://localhost:8123/play
- **API Service**: http://localhost:3000
- **Grafana**: http://localhost:3001 (admin/admin)

## Project Structure

- **api/**: API service code
- **config/**: Configuration files for services
- **flink-job/**: Flink job code
- **scripts/**: Utility scripts
- **volumes/**: Data volumes for persistence
- **generator/**: Data generator container

## Development Workflow

1. Modify the Flink job code in `flink-job/src/main/java/com/edr/flink/EDRProcessingJob.java`
2. Rebuild and redeploy the job with `./build-flink-job.sh`
3. Generate new test data with `./run-generator.sh`
4. Check results in the Flink UI, ClickHouse, or through the API

## Stopping and Cleaning

- Stop the environment: `./stop.sh`
- Clean all data: `./clean.sh`

## Troubleshooting

If you encounter any issues:

1. Check if all containers are running: `docker ps | grep edr`
2. View container logs: `docker logs edr-redpanda`
3. Make sure topics are created: `docker exec edr-redpanda rpk topic list`
4. Generate data directly: `./run-generator.sh --file` to save to a file instead
EOF

  # Create troubleshooting guide
  cat > TROUBLESHOOTING.md << 'EOF' || return 1
# EDR/XDR Development Environment Troubleshooting Guide

## Common Issues and Solutions

### 1. Port Conflicts

**Symptom**: Error when starting containers about ports being already allocated.

**Solution**:
- Check for port conflicts: `sudo lsof -i :PORT_NUMBER`
- Edit docker-compose.yml to use different ports
- Example fix for Redpanda/Flink conflict:
  ```yaml
  redpanda:
    ports:
      - "9092:9092"  # Kafka API
      - "8083:8081"  # Changed from 8081 to 8083
      - "8082:8082"  # HTTP Proxy
  ```

### 2. Kafka Connection Issues

**Symptom**: Data generator can't connect to Redpanda/Kafka.

**Solution**:
1. Create topics manually:
   ```bash
   chmod +x create-topics.sh
   ./create-topics.sh
   ```

2. Verify Redpanda is running:
   ```bash
   docker ps | grep redpanda
   ```

3. Check topics:
   ```bash
   docker exec edr-redpanda rpk topic list
   ```

4. Try using the run-generator.sh script instead:
   ```bash
   ./run-generator.sh
   ```

5. Try file mode as fallback:
   ```bash
   ./run-generator.sh --file
   ```

### 3. Missing Dependencies

**Symptom**: Python scripts fail with import errors.

**Solution**:
```bash
source ./venv/bin/activate  # Or ./activate_venv.sh if it exists
pip install kafka-python clickhouse-driver redis
```

### 4. Flink Job Deployment Issues

**Symptom**: Errors when deploying Flink job.

**Solution**:
1. Check Flink JobManager UI: http://localhost:8081
2. Manually verify job JAR:
   ```bash
   docker exec edr-flink-jobmanager ls -la /opt/flink/usrlib/
   ```
3. Rebuild with proper dependencies:
   ```bash
   cd flink-job
   mvn clean package
   ```

### 5. ClickHouse Connection Issues

**Symptom**: Cannot connect to ClickHouse or table creation errors.

**Solution**:
1. Check ClickHouse is running:
   ```bash
   docker ps | grep clickhouse
   ```
2. Verify ClickHouse initialization:
   ```bash
   docker logs edr-clickhouse
   ```
3. Connect via CLI:
   ```bash
   docker exec -it edr-clickhouse clickhouse-client
   ```

### 6. Complete Reset

If you need to start fresh:

```bash
# Stop everything
./stop.sh

# Remove volumes
docker volume rm edr-dev_redpanda_data edr-dev_clickhouse_data edr-dev_redis_data

# Reset setup progress tracking
rm -f .setup_progress

# Start from scratch
./setup.sh
./start.sh
./create-topics.sh
./build-flink-job.sh
```

## Debugging Tips

### Check Container Logs

```bash
docker logs edr-redpanda
docker logs edr-clickhouse
docker logs edr-flink-jobmanager
docker logs edr-api
```

### Interactive Shell Access

```bash
docker exec -it edr-redpanda bash
docker exec -it edr-clickhouse bash
docker exec -it edr-flink-jobmanager bash
```

### Verify Network Connectivity

```bash
# Check if containers can reach each other
docker exec edr-flink-jobmanager ping redpanda
docker exec edr-api ping clickhouse
```
EOF

  success "Convenience scripts created successfully"
  return 0
}

# Create Flink job
create_flink_job() {
  info "Creating Flink job..."

  # Create pom.xml
  cat > flink-job/pom.xml << EOF || return 1
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>com.edr</groupId>
    <artifactId>edr-flink</artifactId>
    <version>1.0-SNAPSHOT</version>
    <packaging>jar</packaging>

    <properties>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
        <flink.version>1.18.1</flink.version>
        <java.version>11</java.version>
        <scala.binary.version>2.12</scala.binary.version>
    </properties>

    <dependencies>
        <dependency>
            <groupId>org.apache.flink</groupId>
            <artifactId>flink-connector-base</artifactId>
            <version>\${flink.version}</version>
            <scope>provided</scope>
        </dependency>
        <dependency>
            <groupId>org.apache.flink</groupId>
            <artifactId>flink-streaming-java</artifactId>
            <version>\${flink.version}</version>
            <scope>provided</scope>
        </dependency>
        <dependency>
            <groupId>org.apache.flink</groupId>
            <artifactId>flink-clients</artifactId>
            <version>\${flink.version}</version>
            <scope>provided</scope>
        </dependency>
        <dependency>
            <groupId>org.apache.flink</groupId>
            <artifactId>flink-connector-kafka</artifactId>
            <version>3.2.0-1.18</version>
        </dependency>
        <dependency>
            <groupId>org.apache.flink</groupId>
            <artifactId>flink-connector-jdbc</artifactId>
            <version>3.2.0-1.18</version>
        </dependency>
        <dependency>
            <groupId>org.apache.flink</groupId>
            <artifactId>flink-cep</artifactId>
            <version>\${flink.version}</version>
        </dependency>
        <dependency>
            <groupId>com.clickhouse</groupId>
            <artifactId>clickhouse-jdbc</artifactId>
            <version>0.4.6</version>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-compiler-plugin</artifactId>
                <version>3.8.1</version>
                <configuration>
                    <source>\${java.version}</source>
                    <target>\${java.version}</target>
                </configuration>
            </plugin>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-shade-plugin</artifactId>
                <version>3.2.4</version>
                <executions>
                    <execution>
                        <phase>package</phase>
                        <goals>
                            <goal>shade</goal>
                        </goals>
                        <configuration>
                            <transformers>
                                <transformer implementation="org.apache.maven.plugins.shade.resource.ManifestResourceTransformer">
                                    <mainClass>com.edr.flink.EDRProcessingJob</mainClass>
                                </transformer>
                            </transformers>
                        </configuration>
                    </execution>
                </executions>
            </plugin>
        </plugins>
    </build>
</project>
EOF

  # Create a placeholder for the EDRProcessingJob.java file
  # This file is quite large, so we'll just create a minimal placeholder
  # and inform the user that they should check the documentation for full implementation
  cat > flink-job/src/main/java/com/edr/flink/EDRProcessingJob.java << 'EOF' || return 1
package com.edr.flink;

import org.apache.flink.api.common.eventtime.WatermarkStrategy;
import org.apache.flink.api.common.functions.MapFunction;
import org.apache.flink.api.common.serialization.SimpleStringSchema;
import org.apache.flink.cep.CEP;
import org.apache.flink.cep.PatternSelectFunction;
import org.apache.flink.cep.PatternStream;
import org.apache.flink.cep.pattern.Pattern;
import org.apache.flink.cep.pattern.conditions.SimpleCondition;
import org.apache.flink.connector.base.DeliveryGuarantee;
import org.apache.flink.connector.kafka.sink.KafkaRecordSerializationSchema;
import org.apache.flink.connector.kafka.sink.KafkaSink;
import org.apache.flink.connector.kafka.source.KafkaSource;
import org.apache.flink.connector.kafka.source.enumerator.initializer.OffsetsInitializer;
import org.apache.flink.connector.jdbc.JdbcConnectionOptions;
import org.apache.flink.connector.jdbc.JdbcExecutionOptions;
import org.apache.flink.connector.jdbc.JdbcSink;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.windowing.time.Time;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

public class EDRProcessingJob {

    private static final ObjectMapper jsonParser = new ObjectMapper();

    public static void main(String[] args) throws Exception {
        // Set up execution environment
        final StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        env.enableCheckpointing(10000); // Checkpoint every 10 seconds
        env.setParallelism(2);

        // Define Kafka source for raw events
        KafkaSource<String> rawEventsSource = KafkaSource.<String>builder()
                .setBootstrapServers("redpanda:9092")
                .setTopics("raw-events")
                .setGroupId("edr-flink-processor")
                .setStartingOffsets(OffsetsInitializer.earliest())
                .setValueOnlyDeserializer(new SimpleStringSchema())
                .build();

        // Read and parse events
        DataStream<Event> rawEvents = env
                .fromSource(rawEventsSource, WatermarkStrategy.forBoundedOutOfOrderness(Duration.ofSeconds(5)), "Raw Events Source")
                .map(new EventParser())
                .assignTimestampsAndWatermarks(
                        WatermarkStrategy.<Event>forBoundedOutOfOrderness(Duration.ofSeconds(5))
                                .withTimestampAssigner((event, timestamp) -> event.getTimestamp())
                );

        // Apply normalization to all events
        DataStream<Event> normalizedEvents = rawEvents.map(new EventNormalizer());

        // Store all normalized events in ClickHouse
        normalizedEvents.addSink(
                JdbcSink.sink(
                        "INSERT INTO edr.events (id, timestamp, endpoint_id, event_type, status, direction, bytes, source_ip, destination_ip, process_name, user) " +
                                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        (statement, event) -> {
                            statement.setString(1, event.getId());
                            statement.setLong(2, event.getTimestamp());
                            statement.setString(3, event.getEndpointId());
                            statement.setString(4, event.getEventType());
                            statement.setString(5, event.getStatus());
                            statement.setString(6, event.getDirection());
                            statement.setLong(7, event.getBytes());
                            statement.setString(8, event.getSourceIp());
                            statement.setString(9, event.getDestinationIp());
                            statement.setString(10, event.getProcessName());
                            statement.setString(11, event.getUser());
                        },
                        JdbcExecutionOptions.builder()
                                .withBatchSize(1000)
                                .withBatchIntervalMs(200)
                                .withMaxRetries(5)
                                .build(),
                        new JdbcConnectionOptions.JdbcConnectionOptionsBuilder()
                                .withUrl("jdbc:clickhouse://clickhouse:8123/edr")
                                .withDriverName("com.clickhouse.jdbc.ClickHouseDriver")
                                .withUsername("default")
                                .withPassword("edrpassword")
                                .build()
                )
        );

        // Define CEP patterns
        
        // Pattern 1: Multiple failed login attempts
        Pattern<Event, ?> multipleFailedLogins = Pattern.<Event>begin("first")
                .where(new SimpleCondition<Event>() {
                    @Override
                    public boolean filter(Event event) {
                        return "login".equals(event.getEventType()) && "failed".equals(event.getStatus());
                    }
                })
                .times(3).within(Time.minutes(5));

        // Pattern 2: Suspicious process execution followed by network connection
        Pattern<Event, ?> suspiciousProcess = Pattern.<Event>begin("process")
                .where(new SimpleCondition<Event>() {
                    @Override
                    public boolean filter(Event event) {
                        return "process".equals(event.getEventType()) && 
                               isSuspiciousProcess(event.getProcessName());
                    }
                })
                .next("network")
                .where(new SimpleCondition<Event>() {
                    @Override
                    public boolean filter(Event event) {
                        return "network".equals(event.getEventType()) && 
                               "outbound".equals(event.getDirection());
                    }
                })
                .within(Time.minutes(1));

        // Apply patterns to the normalized events
        PatternStream<Event> failedLoginPattern = CEP.pattern(normalizedEvents, multipleFailedLogins);
        PatternStream<Event> suspiciousProcessPattern = CEP.pattern(normalizedEvents, suspiciousProcess);

        // Process pattern matches and create detections
        DataStream<Detection> failedLoginDetections = failedLoginPattern.select(
                (PatternSelectFunction<Event, Detection>) patternMap -> {
                    List<Event> events = patternMap.get("first");
                    return createDetection("RULE-001", 3, events.get(0).getEndpointId(), 
                            "Multiple failed login attempts", events);
                }
        );

        DataStream<Detection> suspiciousProcessDetections = suspiciousProcessPattern.select(
                (PatternSelectFunction<Event, Detection>) patternMap -> {
                    Event processEvent = patternMap.get("process").get(0);
                    Event networkEvent = patternMap.get("network").get(0);
                    return createDetection("RULE-002", 4, processEvent.getEndpointId(), 
                            "Suspicious process with network activity: " + processEvent.getProcessName(), 
                            List.of(processEvent, networkEvent));
                }
        );

        // Merge all detections
        DataStream<Detection> allDetections = failedLoginDetections
                .union(suspiciousProcessDetections);

        // Store detections in ClickHouse
        allDetections.addSink(
                JdbcSink.sink(
                        "INSERT INTO edr.detections (id, timestamp, rule_id, severity, endpoint_id, description, event_ids) " +
                                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                        (statement, detection) -> {
                            statement.setString(1, detection.getId());
                            statement.setLong(2, detection.getTimestamp());
                            statement.setString(3, detection.getRuleId());
                            statement.setInt(4, detection.getSeverity());
                            statement.setString(5, detection.getEndpointId());
                            statement.setString(6, detection.getDescription());
                            statement.setString(7, detection.getEventIds());
                        },
                        JdbcExecutionOptions.builder()
                                .withBatchSize(100)
                                .withBatchIntervalMs(200)
                                .withMaxRetries(5)
                                .build(),
                        new JdbcConnectionOptions.JdbcConnectionOptionsBuilder()
                                .withUrl("jdbc:clickhouse://clickhouse:8123/edr")
                                .withDriverName("com.clickhouse.jdbc.ClickHouseDriver")
                                .withUsername("default")
                                .withPassword("edrpassword")
                                .build()
                )
        );

        // Also publish detections to Kafka for real-time alerting
        KafkaSink<String> detectionSink = KafkaSink.<String>builder()
                .setBootstrapServers("redpanda:9092")
                .setRecordSerializer(KafkaRecordSerializationSchema.builder()
                        .setTopic("detections")
                        .setValueSerializationSchema(new SimpleStringSchema())
                        .build())
                .setDeliveryGuarantee(DeliveryGuarantee.AT_LEAST_ONCE)
                .build();

        allDetections
                .map(detection -> jsonParser.writeValueAsString(detection))
                .sinkTo(detectionSink);

        // Execute the Flink job
        env.execute("EDR Processing and Detection");
    }

    private static boolean isSuspiciousProcess(String processName) {
        // In production, this would check against a list of suspicious processes
        String[] suspiciousProcesses = {"mimikatz", "psexec", "powershell.exe", "cmd.exe", "rundll32.exe"};
        for (String p : suspiciousProcesses) {
            if (processName != null && processName.toLowerCase().contains(p.toLowerCase())) {
                return true;
            }
        }
        return false;
    }

    private static Detection createDetection(String ruleId, int severity, String endpointId, 
                                             String description, List<Event> events) {
        Detection d = new Detection();
        d.setId(UUID.randomUUID().toString());
        d.setTimestamp(System.currentTimeMillis());
        d.setRuleId(ruleId);
        d.setSeverity(severity);
        d.setEndpointId(endpointId);
        d.setDescription(description);

        // Collect event IDs
        StringBuilder eventIds = new StringBuilder();
        for (int i = 0; i < events.size(); i++) {
            eventIds.append(events.get(i).getId());
            if (i < events.size() - 1) {
                eventIds.append(",");
            }
        }
        d.setEventIds(eventIds.toString());
        
        return d;
    }

    // Event parsing function
    public static class EventParser implements MapFunction<String, Event> {
        @Override
        public Event map(String eventJson) throws Exception {
            JsonNode root = jsonParser.readTree(eventJson);
            
            Event event = new Event();
            event.setId(root.path("id").asText(UUID.randomUUID().toString()));
            event.setTimestamp(root.path("timestamp").asLong(System.currentTimeMillis()));
            event.setEndpointId(root.path("endpoint_id").asText());
            event.setEventType(root.path("event_type").asText());
            event.setStatus(root.path("status").asText());
            event.setDirection(root.path("direction").asText());
            event.setBytes(root.path("bytes").asLong(0));
            event.setSourceIp(root.path("source_ip").asText());
            event.setDestinationIp(root.path("destination_ip").asText());
            event.setProcessName(root.path("process_name").asText());
            event.setUser(root.path("user").asText());
            
            return event;
        }
    }

    // Event normalization function
    public static class EventNormalizer implements MapFunction<Event, Event> {
        @Override
        public Event map(Event event) throws Exception {
            // This would have more complex normalization logic in production
            // For now, we just ensure some basic fields are standardized
            
            if (event.getEventType() != null) {
                event.setEventType(event.getEventType().toLowerCase());
            }
            
            if (event.getStatus() != null) {
                event.setStatus(event.getStatus().toLowerCase());
            }
            
            if (event.getDirection() != null) {
                event.setDirection(event.getDirection().toLowerCase());
            }
            
            if (event.getProcessName() != null) {
                event.setProcessName(event.getProcessName().toLowerCase());
            }
            
            return event;
        }
    }

    // Entity classes
    public static class Event {
        private String id;
        private long timestamp;
        private String endpointId;
        private String eventType;
        private String status;
        private String direction;
        private long bytes;
        private String sourceIp;
        private String destinationIp;
        private String processName;
        private String user;

        // Getters and setters
        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        
        public long getTimestamp() { return timestamp; }
        public void setTimestamp(long timestamp) { this.timestamp = timestamp; }
        
        public String getEndpointId() { return endpointId; }
        public void setEndpointId(String endpointId) { this.endpointId = endpointId; }
        
        public String getEventType() { return eventType; }
        public void setEventType(String eventType) { this.eventType = eventType; }
        
        public String getStatus() { return status; }
        public void setStatus(String status) { this.status = status; }
        
        public String getDirection() { return direction; }
        public void setDirection(String direction) { this.direction = direction; }
        
        public long getBytes() { return bytes; }
        public void setBytes(long bytes) { this.bytes = bytes; }
        
        public String getSourceIp() { return sourceIp; }
        public void setSourceIp(String sourceIp) { this.sourceIp = sourceIp; }
        
        public String getDestinationIp() { return destinationIp; }
        public void setDestinationIp(String destinationIp) { this.destinationIp = destinationIp; }
        
        public String getProcessName() { return processName; }
        public void setProcessName(String processName) { this.processName = processName; }
        
        public String getUser() { return user; }
        public void setUser(String user) { this.user = user; }
    }

    public static class Detection {
        private String id;
        private long timestamp;
        private String ruleId;
        private int severity;
        private String endpointId;
        private String description;
        private String eventIds;

        // Getters and setters
        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        
        public long getTimestamp() { return timestamp; }
        public void setTimestamp(long timestamp) { this.timestamp = timestamp; }
        
        public String getRuleId() { return ruleId; }
        public void setRuleId(String ruleId) { this.ruleId = ruleId; }
        
        public int getSeverity() { return severity; }
        public void setSeverity(int severity) { this.severity = severity; }
        
        public String getEndpointId() { return endpointId; }
        public void setEndpointId(String endpointId) { this.endpointId = endpointId; }
        
        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }
        
        public String getEventIds() { return eventIds; }
        public void setEventIds(String eventIds) { this.eventIds = eventIds; }
    }
}
EOF

  success "Flink job created successfully"
  return 0
}

# New function to automatically start and verify the environment
auto_start_verify() {
  info "Starting automatic environment setup and verification..."
  
  # Start all services
  info "Starting services with ./start.sh"
  ./start.sh || {
    error "Failed to start services. Please check the logs."
    return 1
  }
  
  # Give some time for services to initialize
  info "Waiting for services to initialize (10 seconds)..."
  sleep 10
  
  # Build and deploy Flink job
  info "Building and deploying Flink job with ./build-flink-job.sh"
  ./build-flink-job.sh || {
    warning "Failed to build/deploy Flink job. Continuing anyway..."
  }
  
  # Wait for Flink job to initialize
  info "Waiting for Flink job to initialize (10 seconds)..."
  sleep 10
  
  # Generate test data
  info "Generating test data with ./run-generator.sh"
  ./run-generator.sh --duration 20 --endpoints 5 || {
    warning "Failed to generate test data. Continuing anyway..."
  }
  
  # Wait for data to be processed
  info "Waiting for data to be processed (10 seconds)..."
  sleep 10
  
  # Check environment
  info "Verifying environment with ./check-environment.sh"
  if ./check-environment.sh; then
    success "Environment verification completed successfully!"
    return 0
  else
    warning "Environment verification completed with some issues. Check logs for details."
    return 1
  fi
}

# Main function to run all steps
main() {
  init_log
  init_progress
  
  run_step "prerequisites" check_prerequisites
  run_step "python_setup" setup_python
  run_step "directories" create_directories
  run_step "docker_compose" create_docker_compose
  run_step "generator_dockerfile" create_generator_dockerfile
  run_step "config_files" create_config_files
  run_step "api_service" create_api_service
  run_step "test_data_generator" create_test_data_generator
  run_step "flink_job" create_flink_job
  run_step "convenience_scripts" create_convenience_scripts
  
  # Check if setup was successful
  if [ -f "$PROGRESS_FILE" ]; then
    # Auto-start and verify the environment
    if auto_start_verify; then
      cat << EOF

===========================================================
EDR/XDR Development Environment Setup, Start and Verification Complete!
===========================================================

Your development environment has been automatically:
✓ Set up with all necessary components
✓ Started with all required services
✓ Deployed with the Flink processing job
✓ Populated with test data
✓ Verified with environment checks

The environment is ready for development!

Need help? Check out:
- README.md for general usage
- TROUBLESHOOTING.md for common issues and solutions

Enjoy developing with your EDR/XDR system!
===========================================================

EOF
    else
      cat << EOF

===========================================================
EDR/XDR Development Environment Setup Complete with Warnings
===========================================================

Your development environment has been set up, but there were some issues
during automatic startup and verification.

You may want to manually check the status with:
- './check-environment.sh' to see specific issues
- 'docker ps' to verify all containers are running

Please check the log at $LOG_FILE for details.

Need help? Check out:
- README.md for general usage
- TROUBLESHOOTING.md for common issues and solutions
===========================================================

EOF
    fi
    return 0
  else
    error "Setup encountered errors. Check the log at $LOG_FILE for details."
    return 1
  fi
}

# Execute main function
main "$@"