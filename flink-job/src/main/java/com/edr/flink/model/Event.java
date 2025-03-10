package com.edr.flink.model;

public class Event {
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