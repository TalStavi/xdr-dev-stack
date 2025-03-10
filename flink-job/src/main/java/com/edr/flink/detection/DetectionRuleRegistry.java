package com.edr.flink.detection;

import com.edr.flink.detection.rules.FileWriteExecuteRule;
import com.edr.flink.detection.rules.MultipleFailedLoginsRule;
import com.edr.flink.detection.rules.SuspiciousProcessNetworkRule;
import com.edr.flink.model.Detection;
import com.edr.flink.model.Event;
import org.apache.flink.cep.CEP;
import org.apache.flink.streaming.api.datastream.DataStream;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Registry and manager for detection rules
 */
public class DetectionRuleRegistry {
    private final List<DetectionRule> rules;
    
    private DetectionRuleRegistry(List<DetectionRule> rules) {
        this.rules = Collections.unmodifiableList(new ArrayList<>(rules));
    }
    
    /**
     * Get all registered rules
     */
    public List<DetectionRule> getRules() {
        return rules;
    }
    
    /**
     * Apply all registered rules to an event stream and return a stream of detections
     */
    public DataStream<Detection> applyRules(DataStream<Event> events) {
        if (rules.isEmpty()) {
            return events.getExecutionEnvironment().fromElements();
        }
        
        // Apply the first rule
        DataStream<Detection> detections = CEP.pattern(events, rules.get(0).definePattern())
                .select(rules.get(0).getPatternSelectFunction());
        
        // Apply the remaining rules and union all detections
        for (int i = 1; i < rules.size(); i++) {
            DetectionRule rule = rules.get(i);
            DataStream<Detection> ruleDetections = CEP.pattern(events, rule.definePattern())
                    .select(rule.getPatternSelectFunction());
            detections = detections.union(ruleDetections);
        }
        
        return detections;
    }
    
    /**
     * Create a new builder for the registry
     */
    public static Builder builder() {
        return new Builder();
    }
    
    /**
     * Create the default registry with all standard rules
     */
    public static DetectionRuleRegistry createDefault() {
        return builder()
                .addRule(new MultipleFailedLoginsRule())
                .addRule(new SuspiciousProcessNetworkRule())
                .addRule(new FileWriteExecuteRule())
                .build();
    }
    
    /**
     * Builder for creating rule registries
     */
    public static class Builder {
        private final List<DetectionRule> rules = new ArrayList<>();
        
        /**
         * Add a rule to the registry
         */
        public Builder addRule(DetectionRule rule) {
            rules.add(rule);
            return this;
        }
        
        /**
         * Build the registry
         */
        public DetectionRuleRegistry build() {
            return new DetectionRuleRegistry(rules);
        }
    }
} 