package com.edr.flink.functions;

import com.edr.flink.model.Event;
import org.apache.flink.api.common.functions.MapFunction;

public class EventNormalizer implements MapFunction<Event, Event> {
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