package com.edr.flink.model;

public class Detection {
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