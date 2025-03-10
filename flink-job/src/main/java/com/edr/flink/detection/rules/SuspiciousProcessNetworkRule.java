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

public class SuspiciousProcessNetworkRule implements DetectionRule {
    private static final String RULE_ID = "RULE-002";
    private static final int SEVERITY = 4;
    private static final String DESCRIPTION = "Suspicious process with network activity";

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
        return Pattern.<Event>begin("process")
                .where(new SimpleCondition<Event>() {
                    @Override
                    public boolean filter(Event event) {
                        return "process".equals(event.getEventType()) && 
                               DetectionUtils.isSuspiciousProcess(event.getProcessName());
                    }
                })
                .next("network")
                .where(new IterativeCondition<Event>() {
                    @Override
                    public boolean filter(Event event, Context<Event> ctx) throws Exception {
                        // First check if it's a network event
                        if (!"network".equals(event.getEventType()) || !"outbound".equals(event.getDirection())) {
                            return false;
                        }
                        
                        // Get the process event and compare process names
                        for (Event processEvent : ctx.getEventsForPattern("process")) {
                            // Match if the network event has the same process name as the suspicious process
                            if (processEvent.getProcessName() != null && 
                                processEvent.getProcessName().equals(event.getProcessName())) {
                                return true;
                            }
                        }
                        return false;
                    }
                })
                .within(Time.minutes(1));
    }

    @Override
    public PatternSelectFunction<Event, Detection> getPatternSelectFunction() {
        return new PatternSelectFunction<Event, Detection>() {
            @Override
            public Detection select(Map<String, List<Event>> patternMap) throws Exception {
                Event processEvent = patternMap.get("process").get(0);
                Event networkEvent = patternMap.get("network").get(0);
                
                return DetectionUtils.createDetection(RULE_ID, SEVERITY, processEvent.getEndpointId(), 
                        "Suspicious process with network activity: " + processEvent.getProcessName(), 
                        List.of(processEvent, networkEvent));
            }
        };
    }
} 