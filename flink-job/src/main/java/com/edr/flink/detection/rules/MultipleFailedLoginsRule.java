package com.edr.flink.detection.rules;

import com.edr.flink.detection.DetectionRule;
import com.edr.flink.detection.DetectionUtils;
import com.edr.flink.model.Detection;
import com.edr.flink.model.Event;
import org.apache.flink.cep.PatternSelectFunction;
import org.apache.flink.cep.pattern.Pattern;
import org.apache.flink.cep.pattern.conditions.IterativeCondition;
import org.apache.flink.cep.pattern.conditions.SimpleCondition;
import org.apache.flink.streaming.api.windowing.time.Time;

import java.util.List;
import java.util.Map;

public class MultipleFailedLoginsRule implements DetectionRule {
    private static final String RULE_ID = "RULE-001";
    private static final int SEVERITY = 3;
    private static final String DESCRIPTION = "Multiple failed login attempts detected";

    @Override
    public String getRuleId() {
        return RULE_ID;
    }

    @Override
    public int getSeverity() {
        return SEVERITY;
    }

    @Override
    public String getDescription() {
        return DESCRIPTION;
    }

    @Override
    public Pattern<Event, ?> definePattern() {
        return Pattern.<Event>begin("first")
                .where(new SimpleCondition<Event>() {
                    @Override
                    public boolean filter(Event event) {
                        return "login".equals(event.getEventType()) && 
                               "failed".equals(event.getStatus());
                    }
                })
                .next("second")
                .where(new IterativeCondition<Event>() {
                    @Override
                    public boolean filter(Event event, Context<Event> ctx) throws Exception {
                        // Check if it's a failed login
                        if (!"login".equals(event.getEventType()) || !"failed".equals(event.getStatus())) {
                            return false;
                        }
                        
                        // Get the first event and compare usernames and endpoint IDs
                        for (Event firstEvent : ctx.getEventsForPattern("first")) {
                            // Match if both events have the same user and endpoint
                            return firstEvent.getUser() != null && event.getUser() != null &&
                                   firstEvent.getUser().equals(event.getUser()) &&
                                   firstEvent.getEndpointId().equals(event.getEndpointId());
                        }
                        return false;
                    }
                })
                .next("third")
                .where(new IterativeCondition<Event>() {
                    @Override
                    public boolean filter(Event event, Context<Event> ctx) throws Exception {
                        // Check if it's a failed login
                        if (!"login".equals(event.getEventType()) || !"failed".equals(event.getStatus())) {
                            return false;
                        }
                        
                        // Get the first event to compare usernames
                        Event firstEvent = ctx.getEventsForPattern("first").iterator().next();
                        
                        // Match if this event has the same user and endpoint as the first event
                        return firstEvent.getUser() != null && event.getUser() != null &&
                               firstEvent.getUser().equals(event.getUser()) &&
                               firstEvent.getEndpointId().equals(event.getEndpointId());
                    }
                })
                .within(Time.minutes(5));
    }

    @Override
    public PatternSelectFunction<Event, Detection> getPatternSelectFunction() {
        return new PatternSelectFunction<Event, Detection>() {
            @Override
            public Detection select(Map<String, List<Event>> patternMap) throws Exception {
                Event firstEvent = patternMap.get("first").get(0);
                Event secondEvent = patternMap.get("second").get(0);
                Event thirdEvent = patternMap.get("third").get(0);
                
                String username = firstEvent.getUser() != null ? firstEvent.getUser() : "unknown";
                
                return DetectionUtils.createDetection(RULE_ID, SEVERITY, firstEvent.getEndpointId(), 
                        "Multiple failed login attempts for user: " + username, 
                        List.of(firstEvent, secondEvent, thirdEvent));
            }
        };
    }
} 