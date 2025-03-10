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

public class FileWriteExecuteRule implements DetectionRule {
    private static final String RULE_ID = "RULE-003";
    private static final int SEVERITY = 5;
    private static final String DESCRIPTION = "File written then executed";

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
        return Pattern.<Event>begin("fileWrite")
                .where(new SimpleCondition<Event>() {
                    @Override
                    public boolean filter(Event event) {
                        return "file".equals(event.getEventType()) && 
                               "write".equals(event.getStatus());
                    }
                })
                .next("fileExecute")
                .where(new IterativeCondition<Event>() {
                    @Override
                    public boolean filter(Event event, Context<Event> ctx) throws Exception {
                        // First check if it's a process execution
                        if (!"process".equals(event.getEventType()) || !"success".equals(event.getStatus())) {
                            return false;
                        }
                        
                        // Get the file write event and compare filenames
                        for (Event fileWriteEvent : ctx.getEventsForPattern("fileWrite")) {
                            if (fileWriteEvent.getProcessName() != null &&
                                fileWriteEvent.getProcessName().equals(event.getProcessName())) {
                                return true;
                            }
                        }
                        return false;
                    }
                })
                .within(Time.minutes(5));
    }

    @Override
    public PatternSelectFunction<Event, Detection> getPatternSelectFunction() {
        return new PatternSelectFunction<Event, Detection>() {
            @Override
            public Detection select(Map<String, List<Event>> patternMap) throws Exception {
                Event fileWriteEvent = patternMap.get("fileWrite").get(0);
                Event fileExecuteEvent = patternMap.get("fileExecute").get(0);
                
                return DetectionUtils.createDetection(RULE_ID, SEVERITY, fileExecuteEvent.getEndpointId(), 
                        "File written then executed: " + fileWriteEvent.getProcessName(), 
                        List.of(fileWriteEvent, fileExecuteEvent));
            }
        };
    }
} 