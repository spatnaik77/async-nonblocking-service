package com.sidd.nbs;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.context.annotation.ComponentScan;

/**
 * Created by Siddharth on 4/3/18.
 */

@ComponentScan(basePackages = "com")
@EnableAutoConfiguration
public class Application {

    public static void main(String[] args)
    {
        SpringApplication.run(Application.class, args);
    }
}
