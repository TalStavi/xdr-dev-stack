package com.edr.flink.functions;

import com.edr.flink.model.Event;
import org.apache.flink.api.common.functions.MapFunction;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.JsonNode;
import org.apache.flink.shaded.jackson2.com.fasterxml.jackson.databind.ObjectMapper;

import java.util.UUID;

public class EventParser implements MapFunction<String, Event> {
    private static final ObjectMapper jsonParser = new ObjectMapper();
    
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